# SQLPad for DB2

Forked from: https://github.com/sqlpad/sqlpad

**Steps required to start services**
1. Run: docker-compose up
2. Browse: http://localhsot:3000
3. Create new connection


    *ODBC connection string:*
    ```
    Driver={DB2};HOSTNAME=db2;PORT=50000;DATABASE=testdb;UID=db2inst1;PWD=ibm123;
    ```

    *Database SQL for lookup schema:*
    ```
    select
        TABSCHEMA AS table_schema,
        TABNAME AS table_name,
        COLNAME AS column_name,
        TEXT AS column_description,
        TYPENAME AS data_type
    from syscat.columns
    ```