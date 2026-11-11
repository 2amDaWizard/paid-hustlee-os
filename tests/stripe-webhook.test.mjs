import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {verifyStripeSignature} from '../netlify/functions/stripe-webhook.mjs'
test('stripe verifies signature of raw payload',()=>{
 const payload=JSON.stringify({id:'evt_test',type:'checkout.session.completed'})
 const now=1793923200,secret='whsec_test_secret'
 const digest=createHmac('sha256',secret).update(`${now}.${payload}`).digest('hex')
 assert.equal(verifyStripeSignature(payload,`t=${now},v1=${digest}`,secret,now),true)
 assert.equal(verifyStripeSignature(payload+' ',`t=${now},v1=${digest}`,secret,now),false)
 assert.equal(verifyStripeSignature(payload,`t=${now},v1=${digest}`,'bad-secret',now),false)
 assert.equal(verifyStripeSignature(payload,`t=${now},v1=${digest}`,secret,now+301),false)
})
test('stripe rejects missing or malformed signature',()=>{
 assert.equal(verifyStripeSignature('{}',null,'secret'),false)
 assert.equal(verifyStripeSignature('{}','t=5,v1=invalid','secret',5),false)
})
