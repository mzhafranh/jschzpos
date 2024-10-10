var express = require('express');
var router = express.Router();
const csv = require('csv');
const bcrypt = require('bcrypt');
const saltRounds = 10;
var path = require('path');


/* GET home page. */
module.exports = function (db) {
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

    router.get('/', async function (req, res,) {
        // const url = req.url == '/' ? '/?page=1' : req.url;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const wheresCustomer = []
        const values = []
        // const filter = req.url
        var count = 1;
        var countCustomer = 1;
        var sortBy = req.query.sortBy == undefined ? `date` : req.query.sortBy;
        var order = req.query.order == undefined ? `asc` : req.query.order;

        // console.log('Query: ' + req.query)
        // console.log('Filter: ' + filter)

        if (req.query.startDate || req.query.endDate) {
            if (req.query.startDate && req.query.endDate) {
                let endDate = new Date(req.query.endDate)
                wheres.push(`time BETWEEN $${count++} AND $${count++}`)
                wheresCustomer.push(`s.time BETWEEN $${countCustomer++} AND $${countCustomer++}`)
                values.push(req.query.startDate);
                values.push(endDate);
            }
            else if (req.query.startDate) {
                wheres.push(`time >= $${count++}`)
                wheresCustomer.push(`s.time >= $${countCustomer++}`)
                values.push(req.query.startDate);
            }
            else if (req.query.endDate) {
                let endDate = new Date(req.query.endDate)
                wheres.push(`time <= $${count++}`)
                wheresCustomer.push(`s.time <= $${countCustomer++}`)
                values.push(endDate);
            }
        }

        let sql = `
                    SELECT 
                        DATE_TRUNC('month', time) AS month,
                        'Purchases' AS type,
                        SUM(totalsum) AS total
                    FROM purchases            
        `;
        let sqlCustomer = `
                    SELECT 
                        CASE 
                            WHEN c.customerid = 1 THEN c.customerid
                            ELSE 2
                        END AS customer_group,
                        CASE 
                            WHEN c.customerid = 1 THEN 'Direct'
                            ELSE 'Customer' 
                        END AS customer_name,
                        COUNT(s.invoice) AS sales_count
                    FROM 
                        customers c
                    LEFT JOIN 
                        sales s ON c.customerid = s.customer
        `
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
            sqlCustomer += ` WHERE ${wheresCustomer.join(' AND ')}`
        }
        sql += `
                    GROUP BY month

                    UNION ALL

                    SELECT 
                        DATE_TRUNC('month', time) AS month,
                        'Sales' AS type,
                        SUM(totalsum) AS total
                    FROM sales
        `
        sqlCustomer += `
                    GROUP BY 
                        customer_group, customer_name
                    ORDER BY 
                        sales_count DESC;

        `
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }
        sql += `
                    GROUP BY month
                    ORDER BY month;
        `
        console.log('SQL: ' + sql)
        console.log('SQL Customer: ' + sqlCustomer)
        console.log(values)

        try {
            db.query(sql, [...values], (err, data) => {
                if (err) {
                    console.error(err);
                }
                console.log('Data Rows Dashboard')
                console.log(data.rows)

                const monthlyData = {};

                data.rows.forEach((item) => {
                    // const month = item.month.toISOString().split('T')[0].substring(0, 7); // Get YYYY-MM
                    const date = new Date(item.month);
                    const month = new Intl.DateTimeFormat('en-US', {
                        month: 'short',
                        year: '2-digit'
                    }).format(date);

                    if (!monthlyData[month]) {
                        monthlyData[month] = { date, expense: 0, revenue: 0 };
                    }

                    if (item.type === 'Purchases') {
                        monthlyData[month].expense += parseFloat(item.total);
                    } else if (item.type === 'Sales') {
                        monthlyData[month].revenue += parseFloat(item.total);
                    }
                });

                const resultArray = Object.entries(monthlyData).map(([month, values]) => ({
                    date: values.date,
                    monthly: month,
                    expense: values.expense,
                    revenue: values.revenue,
                    earning: values.revenue - values.expense
                }));

                const rawArray = [...resultArray]
                let filteredArray = []

                if (sortBy == 'date' && order == 'asc') {
                    resultArray.sort((a, b) => new Date(a.date) - new Date(b.date))
                } else if (sortBy == 'date' && order == 'desc') {
                    resultArray.sort((a, b) => new Date(b.date) - new Date(a.date))
                }

                if (sortBy == 'expense' && order == 'asc') {
                    resultArray.sort((a, b) => a.expense - b.expense)
                } else if (sortBy == 'expense' && order == 'desc') {
                    resultArray.sort((a, b) => b.expense - a.expense)
                }

                if (sortBy == 'revenue' && order == 'asc') {
                    resultArray.sort((a, b) => a.revenue - b.revenue)
                } else if (sortBy == 'revenue' && order == 'desc') {
                    resultArray.sort((a, b) => b.revenue - a.revenue)
                }

                if (sortBy == 'earning' && order == 'asc') {
                    resultArray.sort((a, b) => a.earning - b.earning)
                } else if (sortBy == 'earning' && order == 'desc') {
                    resultArray.sort((a, b) => b.earning - a.earning)
                }

                if (req.query.query) {
                    const regex = new RegExp(req.query.query, 'i');
                    filteredArray = resultArray.filter(item => regex.test(item.monthly))
                } else {
                    filteredArray = [...resultArray]
                }

                console.log(resultArray.slice(offset, offset + limit));

                const totalPages = Math.ceil(filteredArray.length / limit)
                const totalData = filteredArray.length

                db.query(sqlCustomer, [...values], (err, dataCustomer) => {
                    if (err) {
                        console.error(err);
                    }

                    console.log('Data Rows Customer')
                    console.log(dataCustomer.rows)

                    let totalSales = 0

                    dataCustomer.rows.forEach((item) => {
                        totalSales += parseInt(item.sales_count)
                    })

                    res.status(200).json({
                        data: filteredArray.slice(offset, offset + limit),
                        rawData: rawArray,
                        dataCustomer: dataCustomer.rows,
                        totalSales,
                        totalPages,
                        totalData,
                        limit,
                        page
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }

        // try {
        //     db.query(sqlCount, values, (err, data) => {
        //         if (err) {
        //             console.error(err);
        //         }
        //         const totalPages = Math.ceil(data.rows[0].total / limit)
        //         const totalData = data.rows[0].total
        //         if (wheres.length > 0) {
        //             sql += ` WHERE ${wheres.join(' AND ')}`
        //         }
        //         sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
        //         console.log('SQL: ' + sql)
        //         console.log([...values, limit, offset])
        //         db.query(sql, [...values, limit, offset], (err, data) => {
        //             if (err) {
        //                 console.error(err);
        //             }
        //             res.status(200).json({
        //                 data: data.rows
        //             })
        //         })
        //     })
        // } catch (err) {
        //     res.status(500).json({ message: "error ambil data" })
        // }

    })

    router.get('/csv', (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const wheresCustomer = []
        const values = []
        var count = 1;
        var countCustomer = 1;
        var sortBy = req.query.sortBy == undefined ? `date` : req.query.sortBy;
        var order = req.query.order == undefined ? `asc` : req.query.order;

        // console.log('Query: ' + req.query)
        // console.log('Filter: ' + filter)

        if (req.query.startDate || req.query.endDate) {
            if (req.query.startDate && req.query.endDate) {
                let endDate = new Date(req.query.endDate)
                wheres.push(`time BETWEEN $${count++} AND $${count++}`)
                wheresCustomer.push(`s.time BETWEEN $${countCustomer++} AND $${countCustomer++}`)
                values.push(req.query.startDate);
                values.push(endDate);
            }
            else if (req.query.startDate) {
                wheres.push(`time >= $${count++}`)
                wheresCustomer.push(`s.time >= $${countCustomer++}`)
                values.push(req.query.startDate);
            }
            else if (req.query.endDate) {
                let endDate = new Date(req.query.endDate)
                wheres.push(`time <= $${count++}`)
                wheresCustomer.push(`s.time <= $${countCustomer++}`)
                values.push(endDate);
            }
        }

        let sql = `
                    SELECT 
                        DATE_TRUNC('month', time) AS month,
                        'Purchases' AS type,
                        SUM(totalsum) AS total
                    FROM purchases            
        `;
        let sqlCustomer = `
                    SELECT 
                        CASE 
                            WHEN c.customerid = 1 THEN c.customerid
                            ELSE 2
                        END AS customer_group,
                        CASE 
                            WHEN c.customerid = 1 THEN 'Direct'
                            ELSE 'Customer' 
                        END AS customer_name,
                        COUNT(s.invoice) AS sales_count
                    FROM 
                        customers c
                    LEFT JOIN 
                        sales s ON c.customerid = s.customer
        `
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
            sqlCustomer += ` WHERE ${wheresCustomer.join(' AND ')}`
        }
        sql += `
                    GROUP BY month

                    UNION ALL

                    SELECT 
                        DATE_TRUNC('month', time) AS month,
                        'Sales' AS type,
                        SUM(totalsum) AS total
                    FROM sales
        `
        sqlCustomer += `
                    GROUP BY 
                        customer_group, customer_name
                    ORDER BY 
                        sales_count DESC;

        `
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }
        sql += `
                    GROUP BY month
                    ORDER BY month;
        `
        console.log('SQL: ' + sql)
        console.log('SQL Customer: ' + sqlCustomer)
        console.log(values)

        try {
            db.query(sql, [...values], (err, data) => {
                if (err) {
                    console.error(err);
                }
                console.log('Data Rows Dashboard')
                console.log(data.rows)

                const monthlyData = {};

                data.rows.forEach((item) => {
                    // const month = item.month.toISOString().split('T')[0].substring(0, 7); // Get YYYY-MM
                    const date = new Date(item.month);
                    const month = new Intl.DateTimeFormat('en-US', {
                        month: 'short',
                        year: '2-digit'
                    }).format(date);

                    if (!monthlyData[month]) {
                        monthlyData[month] = { date, expense: 0, revenue: 0 };
                    }

                    if (item.type === 'Purchases') {
                        monthlyData[month].expense += parseFloat(item.total);
                    } else if (item.type === 'Sales') {
                        monthlyData[month].revenue += parseFloat(item.total);
                    }
                });

                const formattedData = Object.entries(monthlyData).map(([month, values]) => ({
                    Month: month,
                    Expense: values.expense,
                    Revenue: values.revenue,
                    Earning: values.revenue - values.expense
                }));

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');

                csv.stringify(formattedData, { header: true }, (err, output) => {
                    if (err) {
                        console.error('Error generating CSV:', err);
                        res.status(500).send('Server Error');
                    } else {
                        res.send(output);
                    }
                });
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.get('/users', (req, res,) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `userid` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`email ilike '%' || $${count++} || '%' OR name ilike '%' || $${count++} || '%'`);
            values.push(req.query.query)
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM users';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM users'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/users/add', (req, res) => {
        try {
            const { email, name, password, role } = req.body

            console.log(req.body)

            bcrypt.hash(password, saltRounds, function (err, hash) {
                if (err) return res.send(err)
                db.query('INSERT INTO users (email, name, password, role) VALUES ($1, $2, $3, $4) RETURNING *', [email, name, hash, role], (err, data) => {
                    if (err) {
                        console.error(err)
                    }
                    res.status(200).json({ data: data.rows })
                })
            });
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.get('/users/edit/:id', (req, res) => {
        try {
            let userid = req.params.id
            db.query('SELECT * FROM users WHERE userid = $1', [userid], (err, data) => {
                // console.log(data)
                if (err) {
                    console.error(err)
                }
                res.status(200).json({
                    data: data.rows
                })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.put('/users/edit/:id', (req, res) => {
        try {
            let userid = req.params.id
            const { email, name, role } = req.body
            console.log('sampai sini')
            db.query('UPDATE users SET email = $1, name = $2, role = $3 WHERE userid = $4', [email, name, role, userid], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ message: "ok" })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.delete('/users/delete/', (req, res) => {
        try {
            db.query("DELETE FROM users WHERE email = $1", [req.body.email], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/units', (req, res,) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `unit` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`unit ilike '%' || $${count++} || '%' OR name ilike '%' || $${count++} || '%' OR note ilike '%' || $${count++} || '%'`);
            values.push(req.query.query)
            values.push(req.query.query)
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM units';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM units'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/units/add', (req, res) => {
        try {
            const { unit, name, note } = req.body
            console.log(req.body)
            db.query('INSERT INTO units VALUES ($1, $2, $3) RETURNING *', [unit, name, note], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ data: data.rows })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.get('/units/edit/:id', (req, res) => {
        try {
            let unitId = req.params.id
            db.query('SELECT * FROM units WHERE unit = $1', [unitId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({
                    data: data.rows
                })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.put('/units/edit/:id', (req, res) => {
        try {
            let unitId = req.params.id
            const { unit, name, note } = req.body
            db.query('UPDATE units SET unit = $1, name = $2, note = $3 WHERE unit = $4', [unit, name, note, unitId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ message: "ok" })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.delete('/units/delete/', (req, res) => {
        try {
            db.query("DELETE FROM units WHERE unit = $1", [req.body.unit], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/goods', (req, res,) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `barcode` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`barcode ilike '%' || $${count++} || '%' OR name ilike '%' || $${count++} || '%'`);
            values.push(req.query.query)
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM goods';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM goods'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/goods/add', (req, res) => {
        try {
            const { barcode, name, stock, purchaseprice, sellingprice, unit } = req.body
            // console.log(req.body)
            // console.log(req.files)
            if (!req.files || Object.keys(req.files).length === 0) {
                res.status(400).send('No files were uploaded.');
            } else {
                var image = req.files.image
                var imageFilename = barcode + Date.now() + path.extname(image.name)
                var filePath = path.join(__dirname, '..', 'public', 'img', 'goods', imageFilename)
                image.mv(filePath, (err) => {
                    if (err) {
                        return res.status(500).json({ message: "error save data" })
                    }
                    db.query('INSERT INTO goods VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [barcode, name, stock, purchaseprice, sellingprice, unit, imageFilename], (err, data) => {
                        if (err) {
                            console.error(err)
                        }
                        res.status(200).json({ data: data.rows })
                    })
                })
            }
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.get('/goods/edit/:barcode', (req, res) => {
        try {
            let barcode = req.params.barcode
            db.query('SELECT * FROM goods WHERE barcode = $1', [barcode], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({
                    data: data.rows
                })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.put('/goods/edit/:barcode', (req, res) => {
        try {
            const { barcode, name, stock, purchaseprice, sellingprice, unit } = req.body
            console.log(req.files)
            if (!req.files || Object.keys(req.files).length === 0) {
                console.log('sampai A')
                console.log(req.body)
                db.query('UPDATE goods SET name = $1, stock = $2, purchaseprice = $3, sellingprice = $4, unit = $5 WHERE barcode = $6', [name, stock, purchaseprice, sellingprice, unit, barcode], (err) => {
                    if (err) {
                        console.error(err)
                    }
                    res.status(200).json({ message: "ok" })
                })
            } else {
                var image = req.files.image
                var imageFilename = barcode + Date.now() + path.extname(image.name)
                var filePath = path.join(__dirname, '..', 'public', 'img', 'goods', imageFilename)
                image.mv(filePath, (err) => {
                    if (err) {
                        return res.status(500).json({ message: "error save data" })
                    }
                    console.log('sampai B')
                    db.query('UPDATE goods SET name = $1, stock = $2, purchaseprice = $3, sellingprice = $4, unit = $5, picture = $6 WHERE barcode = $7', [name, stock, purchaseprice, sellingprice, unit, imageFilename, barcode], (err) => {
                        if (err) {
                            console.error(err)
                        }
                        res.status(200).json({ message: "ok" })
                    })
                })
            }
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.delete('/goods/delete/', (req, res) => {
        try {
            db.query("DELETE FROM goods WHERE barcode = $1", [req.body.barcode], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/suppliers', (req, res,) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `customerid` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`name ilike '%' || $${count++} || '%' OR address ilike '%' || $${count++} || '%' OR phone ilike '%' || $${count++} || '%'`);
            values.push(req.query.query)
            values.push(req.query.query)
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM suppliers';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM suppliers'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/suppliers/add', (req, res) => {
        try {
            const { name, address, phone } = req.body
            console.log(req.body)
            db.query('INSERT INTO suppliers (name, address, phone) VALUES ($1, $2, $3) RETURNING *', [name, address, phone], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ data: data.rows })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.get('/suppliers/edit/:id', (req, res) => {
        try {
            let supplierId = req.params.id
            db.query('SELECT * FROM suppliers WHERE supplierid = $1', [supplierId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({
                    data: data.rows
                })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.put('/suppliers/edit/:id', (req, res) => {
        try {
            let supplierId = req.params.id
            const { name, address, phone } = req.body
            db.query('UPDATE suppliers SET name = $1, address = $2, phone = $3 WHERE supplierid = $4', [name, address, phone, supplierId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ message: "ok" })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.delete('/suppliers/delete/', (req, res) => {
        try {
            db.query("DELETE FROM suppliers WHERE supplierid = $1", [req.body.supplierid], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/purchases', (req, res,) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `invoice` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;
        var reverseorder = order == 'asc' ? 'desc' : 'asc'

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`invoice ilike '%' || $${count++} || '%'`);
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM purchases LEFT JOIN suppliers ON purchases.supplier = suppliers.supplierid';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM purchases LEFT JOIN suppliers ON purchases.supplier = suppliers.supplierid'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                if (sortBy == 'invoice') {
                    sql += ` ORDER BY CAST(SUBSTRING(invoice FROM 'INV-(\\d{8})-(\\d+)') AS DATE) ${order},
                                      CAST(SUBSTRING(invoice FROM 'INV-\\d{8}-(\\d+)') AS INTEGER) ${order} LIMIT $${count++} OFFSET $${count++}`;
                } else {
                    sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                }
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    // console.log(data.rows)
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.get('/invoice', async (req, res,) => {
        try {
            const currentInvoice = await db.query('SELECT generate_invoice_number() AS invoice')
            const timeNow = await db.query('SELECT get_current_time() AS time')
            console.log()
            res.json({
                invoice: currentInvoice.rows[0].invoice,
                time: timeNow.rows[0].time
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.get('/invoicesales', async (req, res,) => {
        try {
            const currentInvoice = await db.query('SELECT generate_invoice_number_sales() AS invoice')
            const timeNow = await db.query('SELECT get_current_time() AS time')
            console.log()
            res.json({
                invoice: currentInvoice.rows[0].invoice,
                time: timeNow.rows[0].time
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/purchases/add', (req, res) => {
        try {
            const { invoice, time, operator } = req.body
            console.log(req.body)
            db.query('INSERT INTO purchases (invoice, time, totalsum, operator) VALUES ($1, $2, $3, $4) RETURNING *', [invoice, time, 0, operator], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ data: data.rows })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.delete('/purchases/delete/', (req, res) => {
        console.log('sampai delete invoice ', req.body.invoice)
        try {
            db.query("DELETE FROM purchases WHERE invoice = $1", [req.body.invoice], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/purchaseitems', (req, res,) => {
        console.log('sampai /purchaseitems')
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `id` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`invoice = $${count++}`);
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM purchaseitems JOIN goods on purchaseitems.itemcode = goods.barcode';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        console.log('SQL purchaseitems: ' + sql)

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = `SELECT 
                        p.id, 
                        p.invoice, 
                        p.itemcode, 
                        p.quantity, 
                        p.purchaseprice, 
                        p.totalprice, 
                        g.name 
                    FROM purchaseitems p 
                    JOIN goods g 
                    ON p.itemcode = g.barcode`
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/purchaseitems/add', (req, res) => {
        try {
            const { invoice, itemcode, quantity, purchaseprice, totalprice } = req.body
            console.log('ini di post purchaseitems')
            console.log(req.body)
            db.query('INSERT INTO purchaseitems (invoice, itemcode, quantity, purchaseprice, totalprice) VALUES ($1, $2, $3, $4, $5) RETURNING *', [invoice, itemcode, quantity, purchaseprice, totalprice], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ data: data.rows })

            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })


    router.delete('/purchaseitems/delete/', (req, res) => {
        try {
            db.query("DELETE FROM purchaseitems WHERE id = $1", [req.body.id], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/purchases/edit/:invoice', (req, res) => {
        console.log('sampai get purchase edit')
        try {
            let invoice = req.params.invoice
            db.query(`SELECT 
                        p.invoice, 
                        p.time, 
                        p.totalsum,
                        p.supplier,
                        p.operator, 
                        s.name AS supplier_name, 
                        u.name AS user_name
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier = s.supplierid
                    LEFT JOIN "users" u ON p.operator = u.userid
                    WHERE invoice = $1`, [invoice], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({
                    data: data.rows
                })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.put('/purchases/edit/:invoice', (req, res) => {
        console.log('sampai put /purchases/edit/:invoice')
        console.log(req.params.invoice)
        console.log(req.body)
        try {
            let invoice = req.params.invoice
            const { supplier } = req.body
            db.query('UPDATE purchases SET supplier = $1 WHERE invoice = $2', [supplier, invoice], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ message: "ok" })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.get('/customers', (req, res,) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `customerid` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`name ilike '%' || $${count++} || '%' OR address ilike '%' || $${count++} || '%' OR phone ilike '%' || $${count++} || '%'`);
            values.push(req.query.query)
            values.push(req.query.query)
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM customers';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM customers'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/customers/add', (req, res) => {
        try {
            const { name, address, phone } = req.body
            console.log(req.body)
            db.query('INSERT INTO customers (name, address, phone) VALUES ($1, $2, $3) RETURNING *', [name, address, phone], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ data: data.rows })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.get('/customers/edit/:id', (req, res) => {
        try {
            let customerId = req.params.id
            db.query('SELECT * FROM customers WHERE customerid = $1', [customerId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({
                    data: data.rows
                })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.put('/customers/edit/:id', (req, res) => {
        try {
            let customerId = req.params.id
            const { name, address, phone } = req.body
            db.query('UPDATE customers SET name = $1, address = $2, phone = $3 WHERE customerid = $4', [name, address, phone, customerId], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ message: "ok" })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.delete('/customers/delete/', (req, res) => {
        try {
            db.query("DELETE FROM customers WHERE customerid = $1", [req.body.customerid], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/sales', (req, res,) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `invoice` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;
        var reverseorder = order == 'asc' ? 'desc' : 'asc'

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`invoice ilike '%' || $${count++} || '%'`);
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM sales LEFT JOIN customers ON sales.customer = customers.customerid';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM sales LEFT JOIN customers ON sales.customer = customers.customerid'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                if (sortBy == 'invoice') {
                    sql += ` ORDER BY CAST(SUBSTRING(invoice FROM 'INV-PENJ(\\d{8})-(\\d+)') AS DATE) ${order},
                                      CAST(SUBSTRING(invoice FROM 'INV-PENJ(\\d{8})-(\\d+)') AS INTEGER) ${order} LIMIT $${count++} OFFSET $${count++}`;
                } else {
                    sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                }
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    // console.log(data.rows)
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/sales/add', (req, res) => {
        try {
            const { invoice, time, pay, change, customer, operator } = req.body
            console.log(req.body)
            db.query('INSERT INTO sales (invoice, time, totalsum, pay, change, customer, operator) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [invoice, time, 0, pay, change, customer, operator], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ data: data.rows })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.delete('/sales/delete/', (req, res) => {
        console.log('sampai delete invoice ', req.body.invoice)
        try {
            db.query("DELETE FROM sales WHERE invoice = $1", [req.body.invoice], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/saleitems', (req, res,) => {
        console.log('sampai /saleitems')
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `id` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)

        if (req.query.query) {
            wheres.push(`invoice = $${count++}`);
            values.push(req.query.query)
        }

        let sql = 'SELECT COUNT(*) AS total FROM saleitems JOIN goods on saleitems.itemcode = goods.barcode';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        console.log('SQL saleitems: ' + sql)

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = `SELECT 
                        s.id, 
                        s.invoice, 
                        s.itemcode, 
                        s.quantity, 
                        s.sellingprice, 
                        s.totalprice, 
                        g.name 
                    FROM saleitems s 
                    JOIN goods g 
                    ON s.itemcode = g.barcode`
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        limit: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.post('/saleitems/add', (req, res) => {
        try {
            const { invoice, itemcode, quantity, sellingprice, totalprice } = req.body
            console.log('ini di post saleitems')
            console.log(req.body)
            db.query('INSERT INTO saleitems (invoice, itemcode, quantity, sellingprice, totalprice) VALUES ($1, $2, $3, $4, $5) RETURNING *', [invoice, itemcode, quantity, sellingprice, totalprice], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ data: data.rows })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })


    router.delete('/saleitems/delete/', (req, res) => {
        try {
            db.query("DELETE FROM saleitems WHERE id = $1", [req.body.id], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/sales/edit/:invoice', (req, res) => {
        console.log('sampai get sales edit')
        try {
            let invoice = req.params.invoice
            db.query(`SELECT 
                        s.invoice, 
                        s.time, 
                        s.totalsum,
                        s.pay,
                        s.change,
                        s.operator, 
                        c.name AS customer_name, 
                        u.name AS user_name
                    FROM sales s
                    LEFT JOIN customers c ON s.customer = c.customerid
                    LEFT JOIN "users" u ON s.operator = u.userid
                    WHERE invoice = $1`, [invoice], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({
                    data: data.rows
                })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error ambil data" })
        }
    })

    router.put('/sales/edit/:invoice', (req, res) => {
        console.log('sampai put /sales/edit/:invoice')
        try {
            let invoice = req.params.invoice
            const { pay, change, customer } = req.body
            db.query('UPDATE sales SET pay = $1, change = $2, customer = $3 WHERE invoice = $4', [pay, change, customer, invoice], (err, data) => {
                if (err) {
                    console.error(err)
                }
                res.status(200).json({ message: "ok" })
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.post('/add', (req, res) => {
        add(req.body.id, req.body.string, parseInt(req.body.integer), parseFloat(req.body.float), req.body.date, req.body.boolean, (err) => {
            if (err) {
                console.error(err);
            }
        })
        res.redirect('/');
    })


    router.post('/edit/:id', (req, res) => {
        update(req.body.id, req.params.id, req.body.string, parseInt(req.body.integer), parseFloat(req.body.float), req.body.date, req.body.boolean, (err) => {
            if (err) {
                console.error(err)
            }
            res.redirect('/');
        })
    })

    router.get('/gudang', (req, res,) => {
        const page = req.query.page || 1;
        const limit = 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        const filter = req.url
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `id_gudang` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)
        console.log(req.query.sortBy == '')

        if (req.query.id_gudang) {
            wheres.push(`id_gudang ilike '%' || $${count++} || '%'`);
            values.push(req.query.id_gudang);
        }

        if (req.query.nama_gudang) {
            wheres.push(`nama_gudang ilike '%' || $${count++} || '%'`);
            values.push(req.query.nama_gudang);
        }

        if (req.query.alamat) {
            wheres.push(`alamat ilike '%' || $${count++} || '%'`);
            values.push(req.query.alamat);
        }

        let sql = 'SELECT COUNT(*) AS total FROM gudang';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM gudang'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        display: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }

    })

    router.put('/gudang/add', (req, res) => {
        try {
            const { id_gudang, nama_gudang, alamat } = req.body
            db.query('INSERT INTO gudang VALUES ($1, $2, $3)', [id_gudang, nama_gudang, alamat], (err) => {
                if (err) {
                    console.error(err)
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.put('/gudang/edit', (req, res) => {
        try {
            const { idObj, id_gudang, nama_gudang, alamat } = req.body
            db.query('UPDATE gudang SET id_gudang = $1, nama_gudang =  $2, alamat = $3 WHERE id_gudang = $4', [id_gudang, nama_gudang, alamat, idObj], (err) => {
                if (err) {
                    console.error(err)
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error update data" })
        }
    })

    router.put('/gudang/delete/', (req, res) => {
        try {
            db.query("DELETE FROM gudang WHERE id_gudang = $1", [req.body.id_gudang], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/supplier', (req, res,) => {
        const page = req.query.page || 1;
        const limit = 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        const filter = req.url
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `id_supplier` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)
        console.log(req.query.sortBy == '')

        if (req.query.id_supplier) {
            wheres.push(`id_supplier ilike '%' || $${count++} || '%'`);
            values.push(req.query.id_supplier);
        }

        if (req.query.nama_supplier) {
            wheres.push(`nama_supplier ilike '%' || $${count++} || '%'`);
            values.push(req.query.nama_supplier);
        }

        if (req.query.alamat_supplier) {
            wheres.push(`alamat_supplier ilike '%' || $${count++} || '%'`);
            values.push(req.query.alamat_supplier);
        }

        if (req.query.telepon) {
            wheres.push(`telepon ilike '%' || $${count++} || '%'`);
            values.push(req.query.telepon);
        }

        if (req.query.email) {
            wheres.push(`email ilike '%' || $${count++} || '%'`);
            values.push(req.query.email);
        }

        let sql = 'SELECT COUNT(*) AS total FROM supplier';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM supplier'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        display: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }

    })

    router.put('/supplier/add', (req, res) => {
        try {
            const { id_supplier, nama_supplier, alamat_supplier, telepon, email } = req.body
            db.query('INSERT INTO supplier VALUES ($1, $2, $3, $4, $5)', [id_supplier, nama_supplier, alamat_supplier, telepon, email], (err) => {
                if (err) {
                    console.error(err)
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.put('/supplier/edit', (req, res) => {
        try {
            const { idObj, id_supplier, nama_supplier, alamat_supplier, telepon, email } = req.body
            db.query('UPDATE supplier SET id_supplier = $1, nama_supplier =  $2, alamat_supplier = $3, telepon = $4, email = $5 WHERE id_supplier = $6', [id_supplier, nama_supplier, alamat_supplier, telepon, email, idObj], (err) => {
                if (err) {
                    console.error(err)
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error update data" })
        }
    })

    router.put('/supplier/delete/', (req, res) => {
        try {
            db.query("DELETE FROM supplier WHERE id_supplier = $1", [req.body.id_supplier], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    router.get('/satuan', (req, res,) => {
        const page = req.query.page || 1;
        const limit = 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        const filter = req.url
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `id_satuan` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)
        console.log(req.query.sortBy == '')

        if (req.query.id_satuan) {
            wheres.push(`id_satuan ilike '%' || $${count++} || '%'`);
            values.push(req.query.id_satuan);
        }

        if (req.query.nama_satuan) {
            wheres.push(`nama_satuan ilike '%' || $${count++} || '%'`);
            values.push(req.query.nama_satuan);
        }

        if (req.query.keterangan) {
            wheres.push(`keterangan ilike '%' || $${count++} || '%'`);
            values.push(req.query.keterangan);
        }

        let sql = 'SELECT COUNT(*) AS total FROM satuan';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM satuan'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        display: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }

    })

    router.put('/satuan/add', (req, res) => {
        try {
            const { id_satuan, nama_satuan, keterangan } = req.body
            db.query('INSERT INTO satuan VALUES ($1, $2, $3)', [id_satuan, nama_satuan, keterangan], (err) => {
                if (err) {
                    console.error(err)
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.put('/satuan/edit', (req, res) => {
        try {
            const { idObj, id_satuan, nama_satuan, keterangan } = req.body
            db.query('UPDATE satuan SET id_satuan = $1, nama_satuan =  $2, keterangan = $3 WHERE id_satuan = $4', [id_satuan, nama_satuan, keterangan, idObj], (err) => {
                if (err) {
                    console.error(err)
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error update data" })
        }
    })

    router.put('/satuan/delete/', (req, res) => {
        try {
            db.query("DELETE FROM satuan WHERE id_satuan = $1", [req.body.id_satuan], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })



    router.get('/barang', (req, res,) => {
        const page = req.query.page || 1;
        const limit = 5;
        const offset = (page - 1) * limit;
        const wheres = []
        const values = []
        const filter = req.url
        var count = 1;
        var sortBy = req.query.sortBy == '' ? `id_barang` : req.query.sortBy;
        var order = req.query.order == '' ? `asc` : req.query.order;

        console.log(req.query)
        console.log(req.query.sortBy == '')

        if (req.query.id_barang) {
            wheres.push(`id_barang ilike '%' || $${count++} || '%'`);
            values.push(req.query.id_barang);
        }

        if (req.query.nama_barang) {
            wheres.push(`nama_barang ilike '%' || $${count++} || '%'`);
            values.push(req.query.nama_barang);
        }


        let sql = 'SELECT COUNT(*) AS total FROM barang';
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(' AND ')}`
        }

        try {
            db.query(sql, values, (err, data) => {
                if (err) {
                    console.error(err);
                }
                const totalPages = Math.ceil(data.rows[0].total / limit)
                const totalData = data.rows[0].total
                sql = 'SELECT * FROM barang'
                if (wheres.length > 0) {
                    sql += ` WHERE ${wheres.join(' AND ')}`
                }
                sql += ` ORDER BY ${sortBy} ${order} LIMIT $${count++} OFFSET $${count++}`;
                console.log('SQL: ' + sql)
                console.log([...values, limit, offset])
                db.query(sql, [...values, limit, offset], (err, data) => {
                    if (err) {
                        console.error(err);
                    }
                    res.status(200).json({
                        data: data.rows,
                        totalData,
                        totalPages,
                        display: limit,
                        page: parseInt(page)
                    })
                })
            })
        } catch (err) {
            res.status(500).json({ message: "error ambil data" })
        }

    })

    router.put('/barang/add', (req, res) => {
        try {
            const { id_barang, nama_barang } = req.body
            db.query('INSERT INTO barang VALUES ($1, $2, $3)', [id_barang, nama_barang], (err) => {
                if (err) {
                    console.error(err)
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error save data" })
        }
    })

    router.put('/barang/edit', (req, res) => {
        try {
            const { idObj, id_barang, nama_barang } = req.body
            db.query('UPDATE barang SET id_barang = $1, nama_barang =  $2 WHERE id_barang = $3', [id_barang, nama_barang, idObj], (err) => {
                if (err) {
                    console.error(err)
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error update data" })
        }
    })

    router.put('/barang/delete/', (req, res) => {
        try {
            db.query("DELETE FROM barang WHERE id_barang = $1", [req.body.id_barang], (err) => {
                if (err) {
                    console.error(err);
                }
            })
            res.status(200).json({ message: "ok" })
        } catch (err) {
            console.log(err)
            res.status(500).json({ message: "error delete data" })
        }
    })

    return router;
}
