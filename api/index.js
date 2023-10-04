const express = require("express");
const bodyParser = require("body-parser");
const {MongoClient, CURSOR_FLAGS} = require("mongodb");
const PgMem = require("pg-mem");

const db = PgMem.newDb();

    const render = require("./render.js");
// Measurements database setup and access

let database = null;
const collectionName = "measurements";

const startDatabase = async () => {
    try {
        const uri = "mongodb://localhost:27017/?maxPoolSize=20&w=majority";	
        const connection = await MongoClient.connect(uri, {useNewUrlParser: true});
        database = connection.db();
    }
    catch { throw new Error('Error starting mongo database')}
}

const getDatabase = async () => {
    try {
        if (!database) await startDatabase();
        return database;
    }
    catch {
        throw new Error('Error getting mongo database')
    }
}

const insertMeasurement = async (message) => {
    try {
        const {insertedId} = await database.collection(collectionName).insertOne(message);
        return insertedId;
    }
    catch (err) {
        throw new Error(`Unable to insert device: ERROR: ${err}`)
    }
}

const getMeasurements = async() => {
    try {
        const measurements = await database.collection(collectionName).find({}).toArray();
        return measurements
    }
    catch {
        throw new Error(`Unable to get measurments from device: ERROR: ${err}`)
    } 	
}

// API Server

const app = express();

app.use(bodyParser.urlencoded({extended:false}));

app.use(express.static('spa/static'));

const PORT = 8080;

app.post('/measurement', async (req, res) => {
    console.log("device id: " + req.body.id + " temperature: " + req.body.t + " humidity: " + req.body.h);
    try {
        // Check if the required fields exist and are not null or undefined.
        if (!req.body || !req.body.id || !req.body.t || !req.body.h) {
            console.log('missing fields')
            res.status(400).send("Invalid message format: Missing fields");
            return;
        }

        //Check if device exists:
        const findId = db.public.query(`SELECT * FROM devices WHERE device_id = '${req.body.id}'`)

        if (findId.rows.length === 0){
            console.log('Device not found')
            res.status(404).send("Device id not found");
            return;
        }

        // Parse 't' and 'h' to numbers
        const temperature = parseFloat(req.body.t);
        const humidity = parseFloat(req.body.h);

        // Check if 't' is a valid temperature in Celsius.
        if (isNaN(temperature) || req.body.t < -273 || req.body.t > 100) {
            res.status(400).send("Invalid temperature value");
            return;
        }

        // Check if 'h' is a valid humidity value.
        if (isNaN(humidity) || req.body.h < 0 || req.body.h > 100) {
            console.log('Invalid humidity')
            res.status(400).send("Invalid humidity value");
            return;
        }

        // If everything checks out, then insert the measurement
        const { insertedId } = insertMeasurement({ id: req.body.id, t: req.body.t, h: req.body.h });
        res.status(200).send("Received measurement into " + insertedId);
    } catch (err) {
        // Catch measurement insertion error
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
});


app.post('/device', async (req, res) => {
	console.log("device id: " + req.body.id + " name: " + req.body.n + " key: " + req.body.k );
    try {

        if (!req.body || !req.body.id || !req.body.n || !req.body.k) {
            console.log('missing fields')
            res.status(400).send("Invalid message format: Missing fields");
            return;
        }

        //Convert to number
        const id = parseInt(req.body.id);
        const key = parseInt(req.body.k);

        //Check if id is valid
        if(isNaN(id) || id < 0) {
            console.log('Invalid ID')
            res.status(400).send('Invalid ID')
            return
        }

        //check if device exists
        const findId = db.public.query(`SELECT * FROM devices WHERE device_id = '${req.body.id}'`)

        if (findId.rows.length !== 0){
            console.log('Device already in DB')
            res.status(409).send("Device already in DB");
            return;
        }

        // Check if 'n' is a valid name (limit to 20 char).
        if (req.body.n.length > 20) {
            console.log('Invalid Name')
            res.status(400).send("Name must be less than 20 char");
            return;
        }

        // Check if 'k' is a valid key (must be of 6 digit number).
        if (isNaN(key) || key < 100000 || key > 999999) {
            res.status(400).send("Invalid key value");
            return;
        }

        db.public.none("INSERT INTO devices VALUES ('"+req.body.id+ "', '"+req.body.n+"', '"+req.body.k+"')");
        res.send("received new device");
    }
    catch (err) {
        console.log(err)
        res.status(500).send("Internal Server Error");
    }
});


app.get('/web/device',  async (req, res) => {
    try {
        var devices = db.public.many("SELECT * FROM devices").map( (device) => {
            console.log(device);
            return '<tr><td><a href=/web/device/'+ device.device_id +'>' + device.device_id + "</a>" +
                       "</td><td>"+ device.name+"</td><td>"+ device.key+"</td></tr>";
           }
        );
        res.send("<html>"+
                 "<head><title>Sensores</title></head>" +
                 "<body>" +
                    "<table border=\"1\">" +
                       "<tr><th>id</th><th>name</th><th>key</th></tr>" +
                       devices +
                    "</table>" +
                 "</body>" +
            "</html>");
    }
    catch (err) {
        console.log(err)
    }
});

app.get('/web/device/:id', async (req,res) => {
    var template = "<html>"+
                     "<head><title>Sensor {{name}}</title></head>" +
                     "<body>" +
		        "<h1>{{ name }}</h1>"+
		        "id  : {{ id }}<br/>" +
		        "Key : {{ key }}" +
                     "</body>" +
                "</html>";

    try {
        var device = db.public.many("SELECT * FROM devices WHERE device_id = '"+req.params.id+"'");
        console.log(device);
        res.send(render(template,{id:device[0].device_id, key: device[0].key, name:device[0].name}));
    }
    catch (err) {
        console.log(err)
    }
});	


app.get('/term/device/:id', async (req, res) => {
    var red = "\x1b[31m";
    var green = "\x1b[32m";
    var blue = "\x1b[33m";
    var reset = "\x1b[0m";
    var template = "Device name " + red   + "   {{name}}" + reset + "\n" +
		   "       id   " + green + "       {{ id }} " + reset +"\n" +
	           "       key  " + blue  + "  {{ key }}" + reset +"\n";
    try {
        var device = db.public.many("SELECT * FROM devices WHERE device_id = '"+req.params.id+"'");
        console.log(device);
        res.send(render(template,{id:device[0].device_id, key: device[0].key, name:device[0].name}));
    }
    catch (err) {
        console.log(err)
    }
});

app.get('/measurement', async (req,res) => {
    res.send(await getMeasurements());
});

app.get('/device', async (req,res) => {
    try {
        const devices = db.public.many("SELECT * FROM devices")
        res.send(devices);
    }
    catch (err) {
        console.log(err)
    }
});

startDatabase()
.then(async() => {

    const addAdminEndpoint = require("./admin.js");
    addAdminEndpoint(app, render);

    await insertMeasurement({id:'00', t:'18', h:'78'});
    await insertMeasurement({id:'00', t:'19', h:'77'});
    await insertMeasurement({id:'00', t:'17', h:'77'});
    await insertMeasurement({id:'01', t:'17', h:'77'});
    console.log("mongo measurement database Up");

    db.public.none("CREATE TABLE devices (device_id VARCHAR, name VARCHAR, key VARCHAR)");
    db.public.none("INSERT INTO devices VALUES ('00', 'Fake Device 00', '123456')");
    db.public.none("INSERT INTO devices VALUES ('01', 'Fake Device 01', '234567')");
    db.public.none("CREATE TABLE users (user_id VARCHAR, name VARCHAR, key VARCHAR)");
    db.public.none("INSERT INTO users VALUES ('1','Ana','admin123')");
    db.public.none("INSERT INTO users VALUES ('2','Beto','user123')");

    console.log("sql device database up");

    app.listen(PORT, () => {
        console.log(`Listening at ${PORT}`);
    });
})
.catch((err) => console.log(err))
;
