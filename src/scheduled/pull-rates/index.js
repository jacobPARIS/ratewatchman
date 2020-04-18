const { MongoClient } = require('mongodb')
const promiseRetry = require('promise-retry')
const axios = require('axios')
const querystring = require('querystring')
const { parse } = require('node-html-parser')

exports.handler = async function pull(req) {
  const client = new MongoClient('mongodb+srv://alice:kZgW7v8ywwwSXaTh@cluster0-shifn.mongodb.net/test?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

  await promiseRetry((retry, number) => {
    console.info(`MongoClient connecting - attempt ${number}`)

    return client.connect()
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

  const url = 'https://www.ratespy.com/wp-content/themes/ratespy-v2/ajax/latest_mortgage_rate_changes.php'

  const yesterday = new Date()
  yesterday.setHours(0,0,0,0)

  const params = {
    province: 'Ontario',
    'term-1': '1',
    'term-2': '2',
    'term-3': '3',
    'term-4': '4',
    'term-5': '5',
    'term-6-9': '6',
    'term-10': '10',
    'term-10-more': '11',
    'rate-type-fixed': 'Fixed',
    'rate-type-variable': 'Variable',
    'rate-type-hybrid': 'Hybrid',
    'rate-type-heloc': 'HELOC',
  }

  const { data } = await axios.post(url, querystring.stringify({
    ...params,
    pg: '1'
  }))

  const pageNumbers = parse(data).querySelectorAll('.pagination').map(button => {
    const matchGroup = button.rawAttrs.match(/pg=(\d+)/)

    return matchGroup && matchGroup[1]
  }).filter(Boolean)

  const totalPages = Math.max(...pageNumbers)

  let latestRateIds = []
  let isDone = false
  for (let i = 1; i <= totalPages; i++) {
    const page = await axios.post(url, querystring.stringify({ ...params, pg: i + 1 }))
      .then(response => parse(response.data))

    for (const row of page.querySelectorAll('tr')) {
      const spans = row.querySelectorAll('span')

      const lastUpdatedDate = spans.reduce((isDate, span) => {
        if (isDate === true) return new Date(span.rawText.trim())

        if (span.rawText.includes('Date Changed')) return true

        return false
      }, false)

      if (yesterday > lastUpdatedDate) {
        isDone = true

        break
      }

      latestRateIds.push(row.rawAttrs.match(/\d+/g)[0])
    }

    if (isDone) break
  }

  const whenRatesUploaded = latestRateIds.map(async id => {
    await timer(Math.floor(Math.random() * 1000 + 1000))

    return axios.post('https://www.ratespy.com/wp-content/themes/ratespy-v2/ajax/intel_popup.php', querystring.stringify({ id }))
      .then(({ data }) => {
        const expiresAt = new Date(data.closing_deadline)
        expiresAt.setFullYear(new Date().getFullYear())

        if (new Date() > expiresAt) {
          expiresAt.setFullYear(new Date().getFullYear() + 1)
        }

        return client.db().collection('rates').findOneAndReplace(
          {
            rateSpyId: id
          },
          {
          cashback: parseFloat(data.cashback) / 100.0 || 0,
          compoundingFrequency: data.compounding,
          lumpPrepayment: parseFloat(data.lump_pps) / 100.0 || 0,
          notes: data.notes,
          paymentDoubling: data.double_up_payments !== 'No',
          paymentIncrease: parseFloat(data.payment_increase) / 100.0 || 0,
          preApprovals: data.pre_approvals !== 'No',
          priorRate: parseFloat(data.prior_rate) / 100.0 || 0,
          province: data.province,
          lastUpdated: data.rate_last_updated,
          lenderName: data.full_lender_name,
          lenderNotes: data.provider_notes,
          lenderType: data.provider_type,
          rate: parseFloat(data.rate) / 100.0 || 0,
          rateDelta: parseFloat(data.rate_change) / 100.0 || 0,
          rateDiscretionary: parseFloat(data.rateDiscretionary) / 100.0 || 0,
          rateHold: data.rate_hold,
          rateType: data.rate_type.toUpperCase(),
          rateSpyId: id,
          termYears: parseInt(data.term, 10),
          url: data.site,
        })
      })
  })

  const results = await Promise.all(whenRatesUploaded)

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf8',
      'cache-control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0'
    },
    body: JSON.stringify({
      results,
      count: results.length
    })
  }
}

function timer(time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}
