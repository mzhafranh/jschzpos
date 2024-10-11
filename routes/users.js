var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const saltRounds = 10;
const helpers = require('../helpers/util')
var path = require('path');


/* GET home page. */
module.exports = function (db) {

    router.get('/profile', helpers.isLoggedIn, (req, res) => {
        const mode = ''
        let userId = req.session.user.userid
        try {
            db.query('SELECT * FROM users WHERE userid = $1', [userId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.render('profile', { mode, user: req.session.user, info: req.flash('info'), data: data.rows})
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/profile', (req, res) => {
        try {
            let userId = req.session.user.userid
            const { email, name } = req.body
            db.query('UPDATE users SET email = $1, name = $2 WHERE userid = $3', [email, name, userId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                req.session.user.email = email;
                req.session.user.name = name;
                req.session.save((err) => {
                    if (err) {
                        req.flash('info', 'Session save failed')
                        return res.redirect('/users/profile');
                    }
                    req.flash('info', 'your profile has been updated')
                    return res.redirect('/users/profile');
                });
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    return router;
}