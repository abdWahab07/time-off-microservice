import { Catch, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
class AllExceptionsFilter {
  /**
   * @param {unknown} exception
   * @param {ArgumentsHost} host
   */
  catch(exception, host) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res && 'error' in res) {
        return response.status(status).json(res);
      }
      const msg =
        typeof res === 'string' ? res : (res && res.message) || 'Error';
      return response.status(status).json({
        error: {
          code: 'HTTP_ERROR',
          message: Array.isArray(msg) ? msg.join(', ') : msg,
          details: null,
        },
      });
    }

    const correlationId = request.correlationId;
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: 'unhandled_error',
        correlationId,
        message: exception?.message,
        stack: exception?.stack,
      }),
    );
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        details: null,
      },
    });
  }
}
export { AllExceptionsFilter };
