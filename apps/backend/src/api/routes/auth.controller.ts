import { AuthService } from "@docgpt/backend/services/auth.service";
import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { Response, Request } from "express";
import { RealIP } from "nestjs-real-ip";
import { UserAgent } from "@docgpt/nestjs-libraries/user/user.agent.decorator";
import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";

@Controller("auth")
export class AuthController {
  constructor(private _authService: AuthService) {}

  @Post("/register")
  async register(
    @Req() req: Request,
    @Res({ passthrough: false }) response: Response,
    @Body() body: CreateOrgUserDto,
    @RealIP() ip: string,
    @UserAgent() userAgent: string,
  ) {
    const getOrgFromCookie = this._authService.getOrgFromCookie(
      req?.cookies?.org,
    );

    const obj = await this._authService.routeAuth(
      body,
      ip,
      userAgent,
      getOrgFromCookie,
    );

    //set cookie
    response.cookie("auth", 'hello');

    //respond
  }

  @Post("/login")
  async login() {}

  async forgot() {}
}
