import { StatusCodes } from "http-status-codes"
import sendResponse from "../shared/sendResponse"
import { Request, Response } from "express"

const notFound = (req:Request, res:Response) =>{
 sendResponse(res, {
    statusCode: StatusCodes.NOT_FOUND,
        success: false,
        message: 'Route Not Found',
        data: null,
 })
}

export default notFound
   
  
  