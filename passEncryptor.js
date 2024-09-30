const bcrypt = require('bcrypt');
const saltRounds = 10;

let password = 'password'

bcrypt.hash(password, saltRounds, function (err, hash) {
    console.log(hash)
});