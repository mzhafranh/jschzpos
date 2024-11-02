CREATE TABLE "users" (
    userid SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    password VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL
);
CREATE TABLE "units" (
    unit VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    note text NOT NULL
);
CREATE TABLE goods (
    barcode VARCHAR(20) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    stock INTEGER NOT NULL,
    purchaseprice NUMERIC(19,2) NOT NULL,
    sellingprice NUMERIC(19,2) NOT NULL,
    unit VARCHAR(10),
    picture TEXT,
CONSTRAINT fk_unit
        FOREIGN KEY (unit) 
        REFERENCES units(unit)
); 
CREATE TABLE suppliers (
    supplierid SERIAL PRIMARY KEY,
    name VARCHAR(100),
    address TEXT,
    phone VARCHAR(20)
);
CREATE TABLE purchases (
    invoice VARCHAR(20) PRIMARY KEY,
    time TIMESTAMP,
    totalsum NUMERIC(19,2),
    supplier INTEGER REFERENCES suppliers(supplierid),
    operator INTEGER REFERENCES users(userid)
);
CREATE TABLE purchaseitems (
    id SERIAL PRIMARY KEY,
    invoice VARCHAR(20) REFERENCES purchases(invoice) ON DELETE CASCADE,
    itemcode VARCHAR(20) REFERENCES goods(barcode) ON UPDATE CASCADE,
    quantity INTEGER,
    purchaseprice NUMERIC(19,2),
    totalprice NUMERIC(19,2)
);
CREATE TABLE daily_invoice_sequence (
    sequence_date DATE PRIMARY KEY,
    last_value INTEGER
);
CREATE TABLE daily_invoice_sequence_sales (
    sequence_date DATE PRIMARY KEY,
    last_value INTEGER
);
CREATE TABLE customers (
    customerid SERIAL PRIMARY KEY,
    name VARCHAR(100),
    address TEXT,
    phone VARCHAR(20)
);
CREATE TABLE sales (
    invoice VARCHAR(20) PRIMARY KEY,
    time TIMESTAMP,
    totalsum NUMERIC(19, 2),
    pay NUMERIC(19, 2),
    change NUMERIC(19, 2),
    customer INTEGER REFERENCES customers(customerid), 
    operator INTEGER REFERENCES users(userid)
);
CREATE TABLE saleitems (
    id SERIAL PRIMARY KEY,
    invoice VARCHAR(20) REFERENCES sales(invoice) ON DELETE CASCADE,
    itemcode VARCHAR(20) REFERENCES goods(barcode) ON UPDATE CASCADE, 
    quantity INTEGER,
    sellingprice NUMERIC(19, 2),
    totalprice NUMERIC(19, 2)
);

CREATE OR REPLACE FUNCTION generate_invoice_number() RETURNS VARCHAR AS $$
DECLARE
    current_date DATE := CURRENT_DATE;  -- Get the current date
    sequence_number INTEGER;
    invoice_number VARCHAR;
BEGIN
    -- Check if there's already an entry for today's date
    SELECT last_value INTO sequence_number FROM daily_invoice_sequence WHERE sequence_date = current_date;

    -- If no entry for today, start at 1, otherwise increment the sequence
    IF NOT FOUND THEN
        sequence_number := 1;
    ELSE
        sequence_number := sequence_number + 1;
    END IF;

    -- Format the invoice number as 'INV-YYYYMMDD-X'
    invoice_number := 'INV-' || TO_CHAR(current_date, 'YYYYMMDD') || '-' || sequence_number;

    RETURN invoice_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_invoice_number_sales() RETURNS VARCHAR AS $$
DECLARE
    current_date DATE := CURRENT_DATE;  -- Get the current date
    sequence_number INTEGER;
    invoice_number VARCHAR;
BEGIN
    -- Check if there's already an entry for today's date
    SELECT last_value INTO sequence_number FROM daily_invoice_sequence_sales WHERE sequence_date = current_date;

    -- If no entry for today, start at 1, otherwise increment the sequence
    IF NOT FOUND THEN
        sequence_number := 1;
    ELSE
        sequence_number := sequence_number + 1;
    END IF;

    -- Format the invoice number as 'INV-YYYYMMDD-X'
    invoice_number := 'INV-PENJ' || TO_CHAR(current_date, 'YYYYMMDD') || '-' || sequence_number;

    RETURN invoice_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_invoice_number() RETURNS TRIGGER AS $$
BEGIN
    NEW.invoice := generate_invoice_number();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_invoice_number
BEFORE INSERT ON purchases
FOR EACH ROW
EXECUTE FUNCTION set_invoice_number();

CREATE OR REPLACE FUNCTION set_invoice_number_sales() RETURNS TRIGGER AS $$
BEGIN
    NEW.invoice := generate_invoice_number_sales();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_invoice_number_sales
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION set_invoice_number_sales();

CREATE OR REPLACE FUNCTION update_daily_invoice_sequence() RETURNS TRIGGER AS $$
DECLARE
    current_date DATE := CURRENT_DATE;  -- Get the current date
    sequence_number INTEGER;
BEGIN
    -- Check if there's already an entry for today's date
    SELECT last_value INTO sequence_number FROM daily_invoice_sequence WHERE sequence_date = current_date;

    -- If no entry for today, start at 1, otherwise increment the sequence
    IF NOT FOUND THEN
        sequence_number := 1;
        -- Insert the initial sequence for today
        INSERT INTO daily_invoice_sequence (sequence_date, last_value) VALUES (current_date, sequence_number);
    ELSE
        sequence_number := sequence_number + 1;
        -- Update the sequence number for today
        UPDATE daily_invoice_sequence SET last_value = sequence_number WHERE sequence_date = current_date;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_daily_invoice_sequence_sales() RETURNS TRIGGER AS $$
DECLARE
    current_date DATE := CURRENT_DATE;  -- Get the current date
    sequence_number INTEGER;
BEGIN
    -- Check if there's already an entry for today's date
    SELECT last_value INTO sequence_number FROM daily_invoice_sequence_sales WHERE sequence_date = current_date;

    -- If no entry for today, start at 1, otherwise increment the sequence
    IF NOT FOUND THEN
        sequence_number := 1;
        -- Insert the initial sequence for today
        INSERT INTO daily_invoice_sequence_sales (sequence_date, last_value) VALUES (current_date, sequence_number);
    ELSE
        sequence_number := sequence_number + 1;
        -- Update the sequence number for today
        UPDATE daily_invoice_sequence_sales SET last_value = sequence_number WHERE sequence_date = current_date;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invoice_sequence
AFTER INSERT ON purchases
FOR EACH ROW
EXECUTE FUNCTION update_daily_invoice_sequence();

CREATE TRIGGER trigger_update_invoice_sequence_sales
AFTER INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION update_daily_invoice_sequence_sales();

CREATE OR REPLACE FUNCTION get_current_time() RETURNS TIMESTAMP AS $$
BEGIN
    RETURN NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION manage_totalsum()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE purchases
        SET totalsum = totalsum + NEW.totalprice
        WHERE invoice = NEW.invoice;

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE purchases
        SET totalsum = totalsum - OLD.totalprice
        WHERE invoice = OLD.invoice;

    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE purchases
        SET totalsum = (
            SELECT SUM(totalprice)
            FROM purchaseitems
            WHERE invoice = NEW.invoice
        )
        WHERE invoice = NEW.invoice;
    END IF;

    RETURN NEW;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION manage_totalsum_sales()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE sales
        SET totalsum = totalsum + NEW.totalprice,
            "change" = pay - (totalsum + NEW.totalprice)
        WHERE invoice = NEW.invoice;

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE sales
        SET totalsum = totalsum - OLD.totalprice,
            "change" = pay - (totalsum - OLD.totalprice)
        WHERE invoice = OLD.invoice;

    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE sales
        SET totalsum = (
            SELECT SUM(totalprice)
            FROM purchaseitems
            WHERE invoice = NEW.invoice
        ),
            "change" = pay - (
                SELECT SUM(totalprice)
                FROM purchaseitems
                WHERE invoice = NEW.invoice
            )
        WHERE invoice = NEW.invoice;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trigger_manage_totalsum
AFTER INSERT OR UPDATE OR DELETE ON purchaseitems
FOR EACH ROW
EXECUTE FUNCTION manage_totalsum();

CREATE TRIGGER trigger_manage_totalsum_sales
AFTER INSERT OR UPDATE OR DELETE ON saleitems
FOR EACH ROW
EXECUTE FUNCTION manage_totalsum_sales();

CREATE OR REPLACE FUNCTION manage_goods_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE goods
        SET stock = stock + NEW.quantity
        WHERE barcode = NEW.itemcode;

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE goods
        SET stock = stock - OLD.quantity
        WHERE barcode = OLD.itemcode;
    END IF;

    RETURN NEW;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION manage_goods_stock_sales()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE goods
        SET stock = stock - NEW.quantity
        WHERE barcode = NEW.itemcode;

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE goods
        SET stock = stock + OLD.quantity
        WHERE barcode = OLD.itemcode;
    END IF;

    RETURN NEW;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_goods_stock
AFTER INSERT OR DELETE ON purchaseitems
FOR EACH ROW
EXECUTE FUNCTION manage_goods_stock();

CREATE TRIGGER trigger_manage_goods_stock_sales
AFTER INSERT OR DELETE ON saleitems
FOR EACH ROW
EXECUTE FUNCTION manage_goods_stock_sales();