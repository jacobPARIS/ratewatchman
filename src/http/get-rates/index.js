const { MongoClient } = require('mongodb')
const promiseRetry = require('promise-retry')

const querystring = require('querystring')

const adminTokens = require('@architect/shared/tokens-admin')
const clientTokens = require('@architect/shared/tokens-client')

exports.handler = async function todos(req) {
  const authorization = req.headers.Authorization || ''

  const [protocol, token] = authorization.split(' ')
  if (protocol !== 'Bearer' || !clientTokens.concat(adminTokens).includes(token)) return {
    headers: {
      'WWW-Authenticate': 'Bearer'
    },
    statusCode: 401
  }

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
    lender,
    termYears,
    rateType,
    updatedBefore,
    updatedAfter,
    limit = 0,
    skip = 0,
  } = req.queryStringParameters

  let originalUrl = `http://${req.headers.Host}${req.path}?${querystring.stringify({ updatedBefore, updatedAfter, limit, skip })}`

  _links.self =  {
    href: originalUrl
  }

  if (lender) {
    filter.lenderName = lender
  }

  if (termYears) {
    filter.termYears = Number(termYears)
  }

  if (rateType) {
    filter.rateType = rateType
  }

  if (updatedBefore) {
    filter.lastUpdated = filter.lastUpdated || {}
    filter.lastUpdated.$lt = new Date(updatedBefore)
  }

  if (updatedAfter) {
    filter.lastUpdated = filter.lastUpdated || {}
    filter.lastUpdated.$gte = new Date(updatedAfter)
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

  const rates = results.map(rate => ({
    id: rate._id,
    rate: rate.rate,
    rateDiscretionary: rate.rateDiscretionary,
    rateType: rate.rateType,
    rateHoldDays: rate.rateHoldDays,
    cashback: rate.cashback,
    compoundingFrequency: rate.compoundingFrequency,
    lumpPrepayment: rate.lumpPrepayment,
    paymentIncrease: rate.paymentIncrease,
    lenderName: rate.lenderName,
    url: rate.url,
    provinces: rate.province.split(','),
    termYears: rate.termYears,
    lenderType: rate.lenderType.toUpperCase(),
    paymentDoubling: rate.paymentDoubling,
    lastUpdated: rate.lastUpdated
  }))

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf8',
      'cache-control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0'
    },
    body: JSON.stringify({
      count: rates.length,
      rates,
      _links
    })
  }
}
