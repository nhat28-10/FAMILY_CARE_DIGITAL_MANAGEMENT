import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Activates the 'jwt' Passport strategy. Apply with @UseGuards(JwtAuthGuard)
 * to protect a route; an invalid/expired token yields a 401.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
