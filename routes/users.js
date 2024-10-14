var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const saltRounds = 10;
const helpers = require('../helpers/util')
var path = require('path');


/* GET home page. */
module.exports = function (db, io) {

    router.get('/profile', helpers.isLoggedIn, (req, res) => {
        const mode = ''
        let userId = req.session.user.userid
        try {
            db.query('SELECT * FROM users WHERE userid = $1', [userId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.render('profile', { mode, user: req.session.user, success: req.flash('success'), info: req.flash('info'), data: data.rows })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/profile', helpers.isLoggedIn, (req, res) => {
        const { email, name } = req.body
        if (!email || !name) {
            req.flash('info', 'all field must be filled')
            return res.redirect('/users/profile');
        }
        try {
            let userId = req.session.user.userid
            db.query('UPDATE users SET email = $1, name = $2 WHERE userid = $3', [email, name, userId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                req.session.user.email = email;
                req.session.user.name = name;
                req.session.save((err) => {
                    if (err) {
                        req.flash('info', 'session save failed')
                        return res.redirect('/users/profile');
                    }
                    req.flash('success', 'your profile has been updated')
                    return res.redirect('/users/profile');
                });
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.get('/changepassword', helpers.isLoggedIn, (req, res) => {
        const mode = ''
        let userId = req.session.user.userid
        try {
            db.query('SELECT * FROM users WHERE userid = $1', [userId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.render('changepassword', { mode, user: req.session.user, success: req.flash('success'), info: req.flash('info'), data: data.rows })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/changepassword', helpers.isLoggedIn, (req, res) => {
        let userId = req.session.user.userid
        const { oldPassword, newPassword, rePassword } = req.body
        if (!oldPassword || !newPassword || !rePassword) {
            req.flash('info', 'all field must be filled')
            return res.redirect('/users/changepassword');
        }
        if (newPassword != rePassword) {
            req.flash('info', "retype password doesn't match")
            return res.redirect('/users/changepassword');
        }

        try {
            db.query('SELECT * FROM users WHERE userid = $1', [userId], (err, data) => {
                if (err) return res.send(err)
                bcrypt.compare(oldPassword, data.rows[0].password, function (err, result) {
                    if (err) return res.send(err)
                    if (!result) {
                        req.flash('info', 'password Incorrect')
                        return res.redirect('/users/changepassword');
                    }
                    bcrypt.hash(newPassword, saltRounds, function (err, hash) {
                        if (err) return res.send(err)
                        db.query('UPDATE users SET password = $1 WHERE userid = $2', [hash, userId], (err, data) => {
                            if (err) {
                                console.error(err)
                            }
                            req.session.user.password = hash;
                            req.session.save((err) => {
                                if (err) {
                                    req.flash('info', 'session save failed')
                                    return res.redirect('/users/changepassword');
                                }
                                req.flash('success', 'your password has been updated')
                                return res.redirect('/users/changepassword');
                            });
                        })
                    });
                });
            })
        } catch (error) {
            console.log(error)
            res.status(500).json({ message: "error save data" })
        }
    })

    return router;
}