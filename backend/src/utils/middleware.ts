import boom from '@hapi/boom';
import type { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import users from '../services/users';
import env from '../lib/env';

type ValidationSchemas = {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
};

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        throw boom.badRequest(
          result.error.issues.map((i) => i.message).join('; ')
        );
      }
      res.locals.params = result.data;
    }
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        throw boom.badRequest(
          result.error.issues.map((i) => i.message).join('; ')
        );
      }
      req.body = result.data;
    }
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        throw boom.badRequest(
          result.error.issues.map((i) => i.message).join('; ')
        );
      }
      res.locals.query = result.data;
    }
    next();
  };
}

export const extractToken = function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorization = req.get('authorization');

  if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
    res.locals.token = authorization.substring(7);
  }

  next();
};

const isJWTPayload = function (
  value: JwtPayload | string
): value is JwtPayload {
  return (value as JwtPayload).id !== undefined;
};

// verifies the JWT without loading the user from the database — for routes
// that only need to know the caller is authenticated (e.g. machine
// translation lookups, where the extra DB roundtrip would add latency)
export const requireToken = function (
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (!res.locals.token) throw boom.unauthorized('token missing or invalid');

  let decodedToken: string | JwtPayload;
  try {
    decodedToken = jwt.verify(res.locals.token, env.SECRET);
  } catch {
    throw boom.unauthorized('token missing or invalid');
  }

  if (!isJWTPayload(decodedToken) || !decodedToken.id) {
    throw boom.unauthorized('token missing or invalid');
  }

  next();
};

export const getUserFromToken = async function (
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (!res.locals.token) throw boom.unauthorized('token missing or invalid');

  let decodedToken: string | JwtPayload;
  try {
    decodedToken = jwt.verify(res.locals.token, env.SECRET);
  } catch {
    throw boom.unauthorized('token missing or invalid');
  }

  if (!isJWTPayload(decodedToken) || !decodedToken.id) {
    throw boom.unauthorized('token missing or invalid');
  }

  const userById = await users.getById(decodedToken.id);
  res.locals.user = userById;

  next();
};
