const express = require("express");
const bodyParser = require("body-parser");
const {MongoClient, CURSOR_FLAGS} = require("mongodb");
const PgMem = require("pg-mem");

const db = PgMem.newDb();

    const render = require("./render.js");
// Measurements database setup and access

let database = null;
const collectionName = "measurements";

startDatabase = async () => {
    try {
        const uri = "mongodb://localhost:27017/?maxPoolSize=20&w=majority";	
        const connection = await MongoClient.connect(uri, {useNewUrlParser: true});
        database = connection.db();
    }
    catch { throw new Error('Error starting mongo database')}
}

getDatabase = async () => {
    try {
        if (!database) await startDatabase();
        return database;
    }
    catch {
        throw new Error('Error getting mongo database')
    }
}

insertMeasurement = async (message) => {
    try {
        const {insertedId} = await database.collection(collectionName).insertOne(message);
        return insertedId;
    }
    catch (err) {
        throw new Error(`Unable to insert device: ERROR: ${err}`)
    }
}

getMeasurements = async() => {
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
-       console.log("device id    : " + req.body.id + " key         : " + req.body.key + " temperature : " + req.body.t + " humidity    : " + req.body.h);	
    try {
        const {insertedId} = insertMeasurement({id:req.body.id, t:req.body.t, h:req.body.h});
        res.send("received measurement into " +  insertedId);
    }
    catch (err) {
        console.log(err)
    }
});

app.post('/device', async (req, res) => {
	console.log("device id    : " + req.body.id + " name        : " + req.body.n + " key         : " + req.body.k );
    try {
        db.public.none("INSERT INTO devices VALUES ('"+req.body.id+ "', '"+req.body.n+"', '"+req.body.k+"')");
        res.send("received new device");
    }
    catch (err) {
        console.log(err)
    }
});


app.get('/web/device',  async (req, res) => {
    try {
        var devices = db.public.many("SELECT * FROM devices").map( function(device) {
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
