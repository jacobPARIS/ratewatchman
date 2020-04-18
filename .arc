@app
begin-app

@scheduled
pull-rates rate(1 day)

@http
get  /rates
