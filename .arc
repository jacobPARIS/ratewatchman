@app
begin-app

@scheduled
pull-rates rate(1 day)

@http
get  /rates
post /todos
post /todos/delete

@tables
data
  scopeID *String
  dataID **String
  ttl TTL
