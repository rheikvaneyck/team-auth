const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline')
const { createClient } = require('redis')

const port = new SerialPort({ path: '/dev/ttyAMA0', baudRate: 115200 })

interface Sms {
  sender: string,
  timestamp: string,
  text: string,
}

var sms_flag = false;
var text_flag = false;
var sms: Sms = {
  sender: "",
  timestamp: "",
  text: "",
};

var sms_list: Array<Sms> = [];

async function parse_sim688(text: string) {
  const client = createClient();
  client.on('error', (err: string) => console.log('Redis Client Error', err));
  await client.connect();
  const lines = text.split("\r\n");
  for (const line in lines) {
    // console.log(lines[line]);
    const l = lines[line].replace(/\"/g,'');
    if(sms_flag && (l.match(/^OK/) == null)) {
      sms.text = l;
      text_flag = true;
    }
    if(l.match(/^\+CMGL/)) {
      const a = l.split(",");
      if (a.length < 5) {
        console.log("can't create sms obj");
        break;
      }
      sms.sender = a[2];
      sms.timestamp = a[4] + " " + a[5];
      sms_flag = true;
    }
    if(text_flag && l.match(/^OK/)) {
      sms_flag = false;
      text_flag = false
      sms_list.push(sms);;
    }
  }
  for (const s in sms_list) {
    const msg = sms_list[s];
    console.log("sender:", msg.sender, "send:",msg.text," at",msg.timestamp);
    await client.set(msg.sender, msg.text, { EX: 600, NX: true });
  }
  await client.disconnect();
  sms_list = []
}

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }))
parser.on('data', parse_sim688);
port.write('AT\r\n');

setInterval(() => {
  port.write('AT+CMGL="REC READ"\r\n');
}, 5000);
