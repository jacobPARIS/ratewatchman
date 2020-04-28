const { MongoClient } = require('mongodb')
const promiseRetry = require('promise-retry')

const querystring = require('querystring')

const adminTokens = require('@architect/shared/tokens-admin')
const clientTokens = require('@architect/shared/tokens-client')

exports.handler = async function getLenders(req) {
  const authorization = req.headers.Authorization || ''

  const [protocol, token] = authorization.split(' ')
  if (protocol !== 'Bearer' || !adminTokens.concat(clientTokens).includes(token)) return {
    headers: {
      'WWW-Authenticate': 'Bearer'
    },
    statusCode: 401
  }

  const mongo = new MongoClient('mongodb+srv://reed:KZUo9Q5LYWWUGM31@cluster0-shifn.mongodb.net/test?retryWrites=true&w=majority', {
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
    maxTimeout: 3000,
  })

  const options = {}
  const _links = {}

  const {
    limit = 0,
    skip = 0,
  } = req.queryStringParameters

  let originalUrl = `http://${req.headers.Host}${req.path}?${querystring.stringify({ limit, skip })}`

  _links.self = {
    href: originalUrl
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

  const lenders = await mongo.db().collection('lenders').find({})
    .toArray()


  console.log(lenders)
  const pagedLenders = limit
    ? lenders.slice(Number(skip), Number(skip) + Number(limit))
    : lenders

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf8',
      'cache-control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0'
    },
    body: JSON.stringify({
      count: lenders.length,
      limit: Number(limit),
      lenders: pagedLenders.map(lender => ({
        name: lender.name,
        longName: lender.longName,
        shortName: lender.shortName
      })),
      _links
    })
  }
}
