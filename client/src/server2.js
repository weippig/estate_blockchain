const pass = require('./pass');
const mysql = require('mysql');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
var multer  = require('multer');
const fetch = require('node-fetch');
const app = express();
var upload = multer({ dest: 'uploads/' })


let CadastralContract  = require('./contracts/CadastralContract.json')
let Web3 = require('web3');
const { useCallback } = require('react');
let web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8546'))

const con = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'your_password',
  database: 'blockchaindata'
});
var buffer = "";

con.connect(function(err){
  if(err) throw err;
  console.log("Connected!");
});

app.use(cors());


async function asyncCall() {
  const accounts = await web3.eth.getAccounts();
  const networkId = await web3.eth.net.getId();
  const deployedNetwork = CadastralContract.networks[networkId];
  const myContract = new web3.eth.Contract(
    CadastralContract.abi,
    deployedNetwork && deployedNetwork.address,
  )
  myContract.events.allEvents()
  .on('data', async(event) => {
    //console.log(event);
    switch(event.event) {
      case "eventCreate":
        create(event);
        insertCreateEvent(event);
        break;
      case "eventDelete":
        old(event);
        deleteFromDB(event);
        break;
      case "eventMerge":
        merge(event);
        break;
      case "eventSplit":
        split(event);
        break;
      default:
        console.log("hello");
    }
  })
  .on('error', console.error);
}

async function insertCreateEvent(blockdata){
  let event = blockdata;
  let date = event.returnValues.createDate;
  date = date.slice(0,4) + '-' + date.slice(4,6) + '-' + date.slice(6,8);
  const INSERT_EVENT_QUERY = `INSERT INTO eventtable (EstateId,ChangeDate,ChangeReason,EstateEvent) VALUES ('${event.returnValues.Id}','${date}',${event.returnValues.functional},'${event.returnValues.eventdata}')`;
  con.query(INSERT_EVENT_QUERY,
    function(err,res){
      if (err) throw err;
      console.log("insert to event table sucess");
  })
}

async function create(blockdata) {
  let event = blockdata;
  let date = event.returnValues.createDate;
  date = date.slice(0,4) + '-' + date.slice(4,6) + '-' + date.slice(6,8);
  let pmno = (event.returnValues.Id).slice(0,4);
  let pcno = (event.returnValues.Id).slice(4,8);
  let scno = (event.returnValues.Id).slice(8,12);
  var parents = [];
  var childs = [];
  if(event.returnValues.functional==2){
    parents = event.returnValues.other;
  }
  if(event.returnValues.functional==1){
    parents = event.returnValues.other;
  }
  let estatedata =  {"id":event.returnValues.Id,"data":{"pmno":pmno,"pcno":pcno,"scno":scno,"county":event.returnValues.county,"townShip":event.returnValues.townShip,"reason":event.returnValues.reason,"begDate":event.returnValues.createDate,"endDate":event.returnValues.endDate,"parents":parents,"children":childs,"changedTag":event.returnValues.changedTag},"polygon":{"points":event.returnValues.pList,"length":event.returnValues.numOfPoint}};
  const INSERT_DATA_QUERY = `INSERT INTO nowestatetable (EstateId,CreateDate,PCNO,PMNO,SCNO,TownShip,County,Reason,ChangeTag,EstateData) VALUES ('${event.returnValues.Id}','${date}',${pcno},${pmno},${scno},'${event.returnValues.townShip}','${event.returnValues.county}',${event.returnValues.reason},${event.returnValues.changedTag},'${JSON.stringify(estatedata)}')`;
  con.query(INSERT_DATA_QUERY,
    function(err,res) {
      if (err) throw err;
      console.log(event.returnValues.Id);
      console.log("insert to nowestate sucess");
      let tracsctionId = event.transactionHash;
      fetch('http://localhost:9000/node01/write/event/create/'+ event.returnValues.Id+'/'+ tracsctionId, {
        credentials: 'omit'
      })
  })
}

async function deleteFromDB(blockdata) {
  let event = blockdata;
  const DELETE_QUERY = `DELETE FROM nowestatetable WHERE EstateId='${event.returnValues.Id}'`;
  con.query(DELETE_QUERY,
    function(err,res){
      if(err) throw err;
      console.log("delete from nowestatetable sucess");
  })
}

async function old(blockdata) {
  let event = blockdata;
  let obj = JSON.parse(event.returnValues.data);
  const INSERT_OLD_QUERY = `INSERT INTO olddatatable (EstateId,BeginDate,EndDate,PCNO,PMNO,SCNO,County,TownShip,Reason,ChangeTag,EstateData) VALUES ('${event.returnValues.Id}','${event.returnValues.begDate}','${event.returnValues.endDate}',${obj.data.pcno},${obj.data.pmno},${obj.data.scno},'${obj.data.county}','${obj.data.townShip}',${obj.data.reason},${0},'${event.returnValues.data}')`;
  con.query(INSERT_OLD_QUERY,
    function(err,res){
      if(err) throw err;
      console.log("insert to oldtable sucess");
  })
  //delete from nowestatetable
}

function merge(blockdata){
  let event = blockdata;
  console.log("merge event:")
  console.log("parent:"+event.returnValues.parentId);
  console.log("child:"+event.returnValues.childId);
}

function split(blockdata){
  let event = blockdata;
  console.log("split event:")
  console.log("parent:"+ event.returnValues.parentId);//??????
  console.log("child:"+ event.returnValues.childId);
}


app.get('/getOne',(req,res) => {
  const {id} = req.query;
  const SELECT_QUERY = `SELECT EstateData FROM nowestatetable WHERE EstateId='${id}'`;
  con.query(SELECT_QUERY,(err,results) => {
      if(err){
          return console.log(err);
      }
      else{
          return res.send(results);
      }
  });
})

app.get('/getNowEstate',(req,res) => {
  const SELECT_NOW_QUERY = "SELECT EstateData FROM nowestatetable";
  con.query(SELECT_NOW_QUERY, (err, results) => {
      if(err){
          return console.log(err);
      }
      else{
          return res.send(results);
      }
  })
})

app.get('/getOldEstate',(req,res) => {
  const SELECT_NOW_QUERY = "SELECT EstateData FROM olddatatable";
  con.query(SELECT_NOW_QUERY, (err, results) => {
      if(err){
          return console.log(err);
      }
      else{
          return res.send(results);
      }
  })
})

app.get('/searchFromNow', (req,res) => {
  const { date } = req.query;
  const SEARCH_QUERY = `SELECT EstateData FROM nowestatetable WHERE CreateDate <= '${date}'`;
  con.query(SEARCH_QUERY, (err, results) => {
      if(err){
          return console.log(err);
      }
      else{
          return res.send(results);
      }
  })
})

app.get('/searchFromOld', (req,res) => {
  const { date } = req.query;
  const SEARCH_QUERY = `SELECT EstateData FROM olddatatable WHERE BeginDate <= '${date}' and EndDate > '${date}'`;
  con.query(SEARCH_QUERY, (err, results) => {
      if(err){
          return console.log(err);
      }
      else{
          return res.send(results);
      }
  })
})

app.get('/searchUniverse', (req,res) => {
  const { id } = req.query;
  const SEARCHFROMOLD = `SELECT EstateData FROM olddatatable WHERE EstateId='${id}'`;
  const SEARCHFROMNOW = `SELECT EstateData FROM nowestatetable WHERE EstateId='${id}'`;
  con.query(SEARCHFROMOLD, (err,results) => {
      if(err){
          return res.send(err);
      }
      else{
          if(results.length === 0){
              con.query(SEARCHFROMNOW,(err,results) => {
                  if(err){
                      return res.send(err);
                  }
                  else{
                      return res.send(results);
                  }
              })
          }
          else{
              return res.send(results);
          }
      }
  })
})

app.get('/searchFromEvent', (req,res) => {
  const { date } = req.query;
  const SEARCH_QUERY = `SELECT EstateId, EstateId, EstateEvent FROM eventtable WHERE ChangeDate > '${date}'`;
  con.query(SEARCH_QUERY, (err, results) => {
      if(err){
          return console.log(err);
      }
      else{
          return res.send(results);
      }
  })
})

app.post('/profile', upload.single('avatar'), function (req, res, next) {
  let county = req.body.county;
  let township = req.body.townShip;
  let originalDate = req.body.begD;
  let date = req.body.begD.slice(0,4) + "-" + req.body.begD.slice(4,6) + "-" + req.body.begD.slice(6,8);
  var id = '';
  var pmno = '';
  var pcno = '';
  var scno = '';
  var points = [];
  fs.createReadStream(req.file.path)
  .pipe(csv())
  .on('data', (row) => {
    pmno = row['PMNO'].toString().padStart(4, "0")
    pcno = row['PCNO'].toString().padStart(4, "0")
    scno = row['SCNO'].toString().padStart(4, "0")
    if (id=='' ) id = scno+pmno+pcno+originalDate;
    if((scno+pmno+pcno+originalDate!= id)){
      points.pop();
      let length = points.length;
      for(let i = length;i<100;i++){
        points.push(["n","n"]);
      }
      let data = {"id":id,"data":{"pmno":pmno,"pcno":pcno,"scno":scno,"county":county,"townShip":township,"reason":"0","begDate":originalDate,"endDate":originalDate,"parents":[],"children":[],"changedTag":"0"},"polygon":{"points":points,"length":length}}
      const INSERT_DATA_QUERY = `INSERT INTO nowestatetable (EstateId,CreateDate,PCNO,PMNO,SCNO,TownShip,County,Reason,ChangeTag,EstateData) VALUES ('${id}','${date}',${id.slice(4,8)},${id.slice(0,4)},${id.slice(8,12)},'${township}','${county}',${0},${0},'${JSON.stringify(data)}')`;
      con.query(INSERT_DATA_QUERY,
        function(err,res) {
          if (err) throw err;
      })
      let eventdata = {"from":[],"to":[data],"changeReason":0,"changeDate":originalDate};
      const INSERT_EVENT_QUERY = `INSERT INTO eventtable (EstateId,ChangeDate,ChangeReason,EstateEvent) VALUES ('${id}','${date}',${0},'${JSON.stringify(eventdata)}')`;
      con.query(INSERT_EVENT_QUERY,
        function(err,res){
        if (err) throw err;
      })
      points = [];
      id = scno+pmno+pcno+originalDate;
    }

    points.push([(row['X']-270000),((-1)*(row['Y']-2774624))])
  })
  .on('end', () => {
    console.log('CSV file successfully processed');
  });

  res.status(204).send();

})


  
asyncCall();

app.listen(4001,() => {
  console.log("listen 4001!");
});

module.exports = {buffer};

