import mysql from 'mysql2/promise';

// Create a connection pool with SSL support for cloud databases
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'finance_management',
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  connectTimeout: 30000, // 30 seconds for cloud databases
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // SSL configuration for cloud databases (Aiven, AWS RDS, etc.)
  ssl: process.env.DB_HOST?.includes('aivencloud.com') || process.env.DB_SSL === 'true'
    ? { 
        rejectUnauthorized: false  // Set to false for testing without CA cert
      }
    : undefined,
});

export default pool;

// Test database connection
export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.error('Connection details:', {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      database: process.env.DB_NAME || 'finance_management',
    });
    return false;
  }
}

// Helper function to execute queries with retry logic
export async function query<T = any>(sql: string, params?: any[], retries = 2): Promise<T[] | any> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const [rows] = await pool.execute(sql, params);
      if (attempt > 0) {
        console.log(`✅ Query succeeded on attempt ${attempt + 1}`);
      }
      // For INSERT/UPDATE/DELETE operations, return the result metadata (including insertId)
      // For SELECT operations, return rows as array
      return rows as T[] | any;
    } catch (error: any) {
      lastError = error;
      const isTimeout = error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET';
      
      console.error(`Database query error (attempt ${attempt + 1}/${retries + 1}):`, {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sql: sql.substring(0, 100) + '...',
      });
      
      // Only retry on timeout errors
      if (isTimeout && attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// Helper function to execute a single query and return one result
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Transaction helper
export async function transaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Enum mappings matching the database schema
export enum AccountType {
  BANK = 1,
  CREDIT_CARD = 2,
  INVESTMENT = 3,
}

export enum TransactionType {
  EXPENSE = 1,
  INCOME = 2,
  TRANSFER = 3,
  INVESTMENT = 4,
  INVEST_WITHDRAW=5

}

export enum CategoryType {
  INCOME = 2,
  EXPENSE = 1,
}
