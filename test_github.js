const axios = require('axios');
axios.get('https://api.github.com/repos/johannhof/typopro-src/contents/web/cormorant-garamond')
  .then(res => {
    console.log(res.data.map(f => f.name));
  })
  .catch(err => {
    console.error(err.message);
  });
