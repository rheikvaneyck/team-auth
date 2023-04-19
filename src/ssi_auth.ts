import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import axios, { AxiosResponse } from 'axios';
import { createClient } from 'redis';
import { getSocket } from './sockets'
import { v4 as uuidv4 } from 'uuid';

export const getLoginCreateReqest = async () => {  
    const challenge = uuidv4();   
    try {
      const response = await axios.post(process.env.SSI_SERVER + '/v3/createrequestvc',
      {
        templateid: process.env.LOGIN_TEMPLATE_ID,
        dataset: {},
        domain: process.env.CALLBACK_URL + '/login',
        challenge: challenge
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Token': process.env.ACCESS_TOKEN
        }
      });
      return { 
        data: {
          error: 0,
          challenge: challenge,
          jwt: response.data.data.jwt
        }
      }
    } catch (err) {
      console.log(`Error posting juno at ${process.env.SSI_SERVER}/v3/createrequestvc`);
      console.log(err);
      return {
        data: {
          error: `Error posting juno at ${process.env.SSI_SERVER}/v3/createrequestvc`
        }
      }  
    }
  }
  
export const getLoginVcToken = async (req: Request, res: Response, next: NextFunction) => {
  const redisClient = createClient({ legacyMode: true })
  await redisClient.connect().catch(console.error)

  if(req.params.token) {
    const jwt = await redisClient.v4.get('chjwt:'+req.params.token); 
    await redisClient.v4.del('chjwt:'+req.params.token)
    await redisClient.disconnect();   
    if (jwt) {
      return res.status(200).json({
          error: 0,
          jwt: jwt
      }); 
    } else {
      return res.status(400).json({
            error: 'Token lookup error'
      });         
    }   
  } else {
    return res.status(400).json({
          error: 'No Token provided'
    });   
  }
}

export const postLoginConsumeReqest = async (req: Request, res: Response, next: NextFunction) => {
  const redisClient = createClient({ legacyMode: true })
  await redisClient.connect().catch(console.error)
  
  try {
    const jwt = req.body.jwt;
    let authToken: string = req.params.token;
    if (!authToken && req.query.challenge) {
      authToken = <string>req.query.challenge
    }
    console.log('Consume Request challenge parameter:', authToken)
    let vcs: Array<any> = [];
    const response = await axios.post(process.env.SSI_SERVER + '/v3/consumerequest', {
      jwt: jwt
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Token': process.env.ACCESS_TOKEN
      }
    })
    response.data.data.payload.verifiableCredential.forEach((element: any) => {
      vcs.push(element)
    });
    console.log('Trusted DID_ISSUER: ', process.env.DID_ISSUER);
    console.log('email: ', vcs[0].credentialSubject.Email);
    console.log('Name: ', vcs[0].credentialSubject.name);
    console.log('did: ', vcs[0].credentialSubject.id);
    console.log('issuer_did: ', vcs[0].issuer.id);

    if(vcs[0].issuer.id === process.env.DID_ISSUER && vcs[0].credentialSubject.id) {
      const did = vcs[0].credentialSubject.id;
      const session_id = await redisClient.v4.get('chid:'+authToken)
      await redisClient.v4.del('chid:'+authToken)
      await redisClient.set('vc:'+session_id, JSON.stringify({did: did, name: vcs[0].credentialSubject.name, issuer: vcs[0].issuer.name}))

      // here: send VC data relevant for the FE back in the response via websocket
      const ws = getSocket(session_id);   
      if(ws) {
        console.log('Socket found for ', session_id)
        ws.send(JSON.stringify({
          error: 0,
          authToken: authToken,
          did: did,
          email: vcs[0].credentialSubject.Email,
          name: vcs[0].credentialSubject.name,
          role: vcs[0].credentialSubject.Role,
        })) 
      }        
    }
    return res.status(200).json({
      data: { 
        error: 0, 
        payload: vcs
      }
    })
  } catch (err) {
    return res.status(403).send('Access denied, invalid VC')
  }
}