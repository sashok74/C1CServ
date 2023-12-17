//import Ajv from 'ajv';
import _Ajv from "ajv";
//import { nomSchema, docSchema } from '../types/schemas.js';
import { Request, Response, NextFunction } from 'express';

const Ajv = _Ajv as unknown as typeof _Ajv.default;
const ajv = new Ajv(); 

export function validateBody(schema: object) {
  const validate = ajv.compile(schema);
  return function (req: Request, res: Response, next: NextFunction) {
    const valid = validate(req.body);
    if (!valid) {
      res.status(400).json({ errors: validate.errors });
    } else {
      next();
    }
  };
}