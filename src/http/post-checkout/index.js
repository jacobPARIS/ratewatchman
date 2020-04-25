const Stripe = require('stripe')
const stripe = Stripe('sk_test_PfriSnPq4YEbGRckGWxeAjXu00G44ETBkP')

exports.handler = async function checkout (req, res) {
  const resource = Stripe.StripeResource.extend({
    request: Stripe.StripeResource.method({
      method: 'POST',
      path: 'billing_portal/sessions',
    })
  })

  const portal = await new Promise((resolve, reject) => {
    new resource(stripe).request({
      customer: 'cus_H9xWXhOuoStmrY',
      return_url: 'https://www.ratewatchman.com/',
    }, (error, response) => {
      if (error) {
        reject(error)
      } else {
        resolve(response)
      }
    })
  })

  return res.redirect(portal.redirect_url)
}
