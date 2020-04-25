const { MongoClient } = require('mongodb')
const promiseRetry = require('promise-retry')

const adminTokens = require('../../tokens-admin')

exports.handler = async function todos(req) {
  const [protocol, token] = req.headers.Authorization.split(' ')

  if (protocol === 'Bearer' && !adminTokens.includes(token)) return {
    headers: {
      'WWW-Authenticate': 'Bearer'
    },
    statusCode: 401
  }

  const mongo = new MongoClient('', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

  req.queryStringParameters = req.queryStringParameters || {}

  await promiseRetry((retry, number) => {
    console.info(`MongoClient connecting - attempt ${number}`)

    return mongo.connect()
      .catch(error => {
        console.error(error)

        retry()
      })
      .then(response => {
        console.log('MongoClient connected successfully')
      })
  }, {
    retries: 3,
    minTimeout: 2000,
    maxTimeout: 5000,
  })

  console.log("Dropping staging...")
  await mongo.db().collection('staging').drop()
    .catch(console.error)

  console.log("Beginning aggregate")
  await mongo.db().collection('rates').aggregate([{
    $addFields: {
      rateHoldDays: {
        $toInt: {
          $arrayElemAt: [
            { $split: ["$rateHold", " "] },
            0
          ]
        }
      }
    }
  }, {
    $project: {
      rateHold: 0
    }
  }, {
    $merge: {
      into: 'staging'
    }
  }]).toArray()

  // console.log("Merging into rates")
  // await mongo.db().collection('staging').aggregate([{
  //   $merge: {
  //     into: 'rates'
  //   }
  // }]).toArray()

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf8',
      'cache-control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0'
    },
    body: JSON.stringify({})
  }
}
