import { Response } from 'express';

type TMeta = Record<string, unknown>;

type TResponse<T> = {
  statusCode: number;
  success: boolean;
  message?: string;
  meta?: TMeta;
  data: T;
};

const sendResponse = <T>(res: Response, data: TResponse<T>) => {
  res.status(data?.statusCode).json({
    success: data.success,
    message: data.message,
    meta: data.meta || null,
    data: data?.data || null
  });
};

export default sendResponse;
