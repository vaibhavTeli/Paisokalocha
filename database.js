/**
 * Database module for PersonalManager.
 *
 * This module handles the local SQLite database setup, table creation,
 * and transaction logging using `react-native-sqlite-storage`.
 *
 * @module database
 */

import SQLite from 'react-native-sqlite-storage';

// Enable Promise-based API for better async/await support
SQLite.enablePromise(true);

const database_name = "PersonalManager.db";

/**
 * Establishes and returns a connection to the local SQLite database.
 *
 * @returns {Promise<SQLite.SQLiteDatabase>} A promise that resolves to the database connection.
 */
export const getDBConnection = async () => {
  return SQLite.openDatabase({ name: database_name, location: 'default' });
};

/**
 * Initializes the database schema by creating necessary tables if they don't exist.
 * Currently creates the `transactions` table for storing spending data.
 *
 * @returns {Promise<void>}
 */
export const createTables = async () => {
  const db = await getDBConnection();
  const query = `CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        amount REAL,
        account_no TEXT,
        description TEXT,
        date TEXT
    );`;
  try {
    await db.executeSql(query);
    console.log("Database tables initialized successfully.");
  } catch (error) {
    console.error("Failed to create database tables:", error);
    throw error;
  }
};

/**
 * Inserts a new financial transaction into the database.
 *
 * @param {string} type - The type of transaction (e.g., 'Automated UPI', 'Manual').
 * @param {number} amount - The transaction amount.
 * @param {string} account_no - The account identifier (e.g., last 4 digits).
 * @param {string} description - Description of the merchant or merchant VPA.
 * @param {string} date - ISO string or timestamp of the transaction.
 * @returns {Promise<[SQLite.ResultSet]>}
 */
export const insertTransaction = async (type, amount, account_no, description, date) => {
  const db = await getDBConnection();
  const insertQuery = `INSERT INTO transactions (type, amount, account_no, description, date) VALUES (?, ?, ?, ?, ?)`;
  return db.executeSql(insertQuery, [type, amount, account_no, description, date]);
};

/**
 * Fetches all transactions from the database, ordered by date descending.
 *
 * @returns {Promise<Array>} List of transaction objects.
 */
export const getTransactions = async () => {
  try {
    const db = await getDBConnection();
    const results = await db.executeSql("SELECT * FROM transactions ORDER BY date DESC");
    let transactions = [];
    results.forEach(result => {
      for (let i = 0; i < result.rows.length; i++) {
        transactions.push(result.rows.item(i));
      }
    });
    return transactions;
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return [];
  }
};
