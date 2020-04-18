const data = require('@begin/data')
const { MongoClient } = require('mongodb')
const promiseRetry = require('promise-retry')

const querystring = require('querystring')

exports.handler = async function todos(req) {
  const mongo = new MongoClient('mongodb+srv://alice:kZgW7v8ywwwSXaTh@cluster0-shifn.mongodb.net/test?retryWrites=true&w=majority', {
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

  const filter = {}
  const options = {}
  const _links = {}

  const {
    before,
    after,
    limit = 0,
    skip = 0
  } = req.queryStringParameters

  let originalUrl = `http://${req.headers.Host}${req.path}?${querystring.stringify({ before, after, limit, skip })}`

  _links.self =  {
    href: originalUrl
  }

  if (before) {
    filter.lastUpdated = filter.lastUpdated || {}
    filter.lastUpdated.$lt = new Date(before)
  }

  if (after) {
    filter.lastUpdated = filter.lastUpdated || {}
    filter.lastUpdated.$gte = new Date(after)
  }

  if (Number(limit) > 0) {
    const nextSkip = Number(skip) + Number(limit)

    options.limit = Number(limit)

    _links.next = {
      href: _links.self.href.replace(`skip=${skip}`, `skip=${nextSkip}`)
    }
  }

  if (Number(skip) > 0) {
    const prevSkip = limit ? Math.max(Number(skip) - Number(limit), 0) : 0

    options.skip = Number(skip)

    _links.prev = {
      href: _links.self.href.replace(`skip=${skip}`, `skip=${prevSkip}`)
    }
  }

  const results = await mongo.db().collection('rates').find(filter, options).toArray()

  return {
    statusCode: 201,
    headers: {
      'content-type': 'application/json; charset=utf8',
      'cache-control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0'
    },
    body: JSON.stringify({
      count: results.length,
      results,
      _links
    })
  }
}
