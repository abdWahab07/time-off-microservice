import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

function mockHost({ correlationId } = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status, json }),
      getRequest: () => ({ correlationId: correlationId ?? 'cid-1' }),
    }),
    _json: json,
    _status: status,
  };
}

describe('AllExceptionsFilter', () => {
  let filter;
  let consoleErrorSpy;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('passes through HttpException body when it already has error shape', () => {
    const host = mockHost();
    const ex = new HttpException(
      { error: { code: 'X', message: 'm', details: null } },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(ex, host);
    expect(host._status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(host._json).toHaveBeenCalledWith(ex.getResponse());
  });

  it('wraps HttpException string response as HTTP_ERROR', () => {
    const host = mockHost();
    const ex = new HttpException('Not allowed', HttpStatus.FORBIDDEN);
    filter.catch(ex, host);
    expect(host._status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(host._json).toHaveBeenCalledWith({
      error: {
        code: 'HTTP_ERROR',
        message: 'Not allowed',
        details: null,
      },
    });
  });

  it('joins array message from HttpException object response', () => {
    const host = mockHost();
    // Nest's BadRequestException body includes `error`, so the filter passes it
    // through unchanged; use a plain object with only `message` to hit the
    // HTTP_ERROR wrapping branch.
    const ex = new HttpException({ message: ['first', 'second'] }, 400);
    filter.catch(ex, host);
    const body = host._json.mock.calls[0][0];
    expect(body.error.code).toBe('HTTP_ERROR');
    expect(body.error.message).toBe('first, second');
  });

  it('returns INTERNAL_ERROR for non-HttpException', () => {
    const host = mockHost({ correlationId: 'corr-xyz' });
    const err = new Error('boom');
    err.stack = 'stack-line';
    filter.catch(err, host);
    expect(host._status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(host._json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        details: null,
      },
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(logged.event).toBe('unhandled_error');
    expect(logged.correlationId).toBe('corr-xyz');
    expect(logged.message).toBe('boom');
  });
});
