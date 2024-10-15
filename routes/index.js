var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const saltRounds = 10;
const helpers = require('../helpers/util')
var path = require('path');

/* GET home page. */
module.exports = function (db, io) {
    function add(id, string, integer, float, date, boolean, callback) {
        db.query('INSERT INTO data VALUES ($1, $2, $3, $4, $5, $6)', [id, string, integer, float, date, boolean], (err) => {
            callback(err);
        });
    }

    function select(id, callback) {
        db.query('SELECT * FROM data WHERE id = $1', [id], (err, data) => {
            callback(err, data);
        })
    }

    function update(newId, oldId, string, integer, float, date, boolean, callback) {
        db.query('UPDATE data SET id = $1, string = $2, integer = $3, float = $4, date = $5, boolean = $6 WHERE id = $7', [newId, string, integer, float, date, boolean, oldId], (err) => {
            callback(err);
        });
    }

    function remove(id, callback) {
        db.query('DELETE FROM data WHERE id = $1', [id], (err) => {
            callback(err);
        })
    }

    router.get('/logout', helpers.isLoggedIn, function (req, res, next) {
        req.session.destroy((err) => {
            res.redirect('/login')
        })
    })

    router.get('/', helpers.isLoggedIn, function (req, res, next) {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }

        const mode = 'dashboard'
        res.render('index', { mode, user: req.session.user })

    })

    router.get('/register', (req, res) => {
        const mode = 'register'
        res.render('register', { mode })
    })

    router.post('/register', (req, res) => {
        const { email, username, password, role } = req.body
        db.query('SELECT * FROM users WHERE email = $1', [email], (err, data) => {
            if (err) return res.send(err)
            if (data.rows.length > 0) return res.send("Email sudah terdaftar")
            bcrypt.hash(password, saltRounds, function (err, hash) {
                if (err) return res.send(err)
                db.query('INSERT INTO users VALUES ($1, $2, $3, $4)', [email, username, hash, role], (err) => {
                    if (err) return res.send(err)
                })
                res.redirect('/users')
            });
        })
    })

    router.get('/login', (req, res) => {
        res.render('login', { info: req.flash('info') })
    })

    router.post('/login', (req, res) => {
        const { email, password } = req.body

        db.query('SELECT * FROM users WHERE email = $1', [email], (err, data) => {
            // console.log(data)
            if (err) return res.send(err)
            if (data.rows.length == 0) {
                req.flash('info', 'Email Not Registered')
                return res.redirect('/login');
            }
            bcrypt.compare(password, data.rows[0].password, function (err, result) {
                if (err) return res.send(err)
                if (!result) {
                    req.flash('info', 'Password Incorrect')
                    return res.redirect('/login');
                }

                req.session.user = data.rows[0]
                if (req.session.user.role == "admin") {
                    res.redirect('/')
                }
                if (req.session.user.role == "op") {
                    res.redirect('/sales')
                }
            });
        })
    })


    router.get('/users', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        const mode = 'users'
        res.render('users', { mode, user: req.session.user })
    })

    router.get('/users/add', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        const mode = 'users'
        res.render('usersadd', { mode, user: req.session.user })
    })

    router.get('/users/edit/:id', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        let userId = req.params.id
        const mode = 'users'
        res.render('usersedit', { mode, userId, user: req.session.user })
    })

    router.get('/units', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        const mode = 'goods'
        res.render('units', { mode, user: req.session.user })
    })

    router.get('/units/add', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        const mode = 'goods'
        res.render('unitsadd', { mode, user: req.session.user })
    })

    router.get('/units/edit/:id', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        let unitId = req.params.id
        const mode = 'goods'
        res.render('unitsedit', { mode, unitId, user: req.session.user })
    })

    router.get('/goods', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        const mode = 'goods'
        res.render('goods', { mode, user: req.session.user })
    })

    router.get('/goods/add', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        const mode = 'goods'
        res.render('goodsadd', { mode, user: req.session.user })
    })

    router.get('/goods/edit/:barcode', helpers.isLoggedIn, (req, res) => {
        if (req.session.user.role == 'op') {
            res.redirect('/sales')
        }
        let barcode = req.params.barcode
        const mode = 'goods'
        res.render('goodsedit', { mode, barcode, user: req.session.user })
    })

    router.get('/suppliers', helpers.isLoggedIn, (req, res) => {
        const mode = 'suppliers'
        res.render('suppliers', { mode, user: req.session.user })
    })

    router.get('/suppliers/add', helpers.isLoggedIn, (req, res) => {
        const mode = 'suppliers'
        res.render('suppliersadd', { mode, user: req.session.user })
    })

    router.get('/suppliers/edit/:id', helpers.isLoggedIn, (req, res) => {
        let supplierId = req.params.id
        const mode = 'suppliers'
        res.render('suppliersedit', { mode, supplierId, user: req.session.user })
    })

    router.get('/purchases', helpers.isLoggedIn, (req, res) => {
        const mode = 'purchases'
        res.render('purchases', { mode, user: req.session.user })
    })

    router.get('/purchases/add', helpers.isLoggedIn, (req, res) => {
        let barcode = false
        const mode = 'purchases'
        res.render('purchasesadd', { mode, user: req.session.user, barcode })
    })

    router.get('/purchases/add/:barcode', helpers.isLoggedIn, (req, res) => {
        let barcode = req.params.barcode
        const mode = 'purchases'
        res.render('purchasesadd', { mode, user: req.session.user, barcode })
    })

    router.get('/purchases/edit/:invoice', helpers.isLoggedIn, (req, res) => {
        let invoice = req.params.invoice
        const mode = 'purchases'
        if (req.session.user.role == 'op') {
            db.query('SELECT * FROM purchases WHERE invoice = $1', [invoice], (err, data) => {
                // console.log(data)
                if (err) {
                    console.error(err)
                }
                if (data.rows[0].operator == req.session.user.userid) {
                    res.render('purchasesedit', { mode, invoice, user: req.session.user })
                }
                else {
                    res.redirect('/purchases')
                }
            })
        } else {
            res.render('purchasesedit', { mode, invoice, user: req.session.user })
        }
    })

    router.get('/customers', helpers.isLoggedIn, (req, res) => {
        const mode = 'customers'
        res.render('customers', { mode, user: req.session.user })
    })

    router.get('/customers/add', helpers.isLoggedIn, (req, res) => {
        const mode = 'customers'
        res.render('customersadd', { mode, user: req.session.user })
    })

    router.get('/customers/edit/:id', helpers.isLoggedIn, (req, res) => {
        let customerId = req.params.id
        const mode = 'customers'
        res.render('customersedit', { mode, customerId, user: req.session.user })
    })

    router.get('/sales', helpers.isLoggedIn, (req, res) => {
        const mode = 'sales'
        res.render('sales', { mode, user: req.session.user })
    })

    router.get('/sales/add', helpers.isLoggedIn, (req, res) => {
        const mode = 'sales'
        res.render('salesadd', { mode, user: req.session.user })
    })

    router.get('/sales/edit/:invoice', helpers.isLoggedIn, (req, res) => {
        let invoice = req.params.invoice
        const mode = 'sales'
        if (req.session.user.role == 'op') {
            db.query('SELECT * FROM sales WHERE invoice = $1', [invoice], (err, data) => {
                // console.log(data)
                if (err) {
                    console.error(err)
                }
                if (data.rows[0].operator == req.session.user.userid) {
                    res.render('salesedit', { mode, invoice, user: req.session.user })
                }
                else {
                    res.redirect('/sales')
                }
            })
        } else {
            res.render('salesedit', { mode, invoice, user: req.session.user })
        }
    })

    router.get('/blank', (req, res) => {
        const mode = 'blank'
        res.render('blank', { mode, user: req.session.user })
    })

    router.get('/test', helpers.isLoggedIn, function (req, res, next) {

        const mode = ''
        res.render('test', { mode, user: req.session.user })

    })

    return router;
}
