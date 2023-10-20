declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: number;
      SERVER: string;
      MODE_ENV: string;
      DB_PORT: number;
      DB_HOST: string;
      DB_NAME: string;
      DB_USER: string;
      DB_PASSWORD: string;
      MONGODB_SERVER: string;
      MONGODB_USER: string;
      MONGODB_PASSWORD: string;
      MONGODB_BASE: string;
      C1_WEBSERVER: string;
    }
  }
}
export {};
