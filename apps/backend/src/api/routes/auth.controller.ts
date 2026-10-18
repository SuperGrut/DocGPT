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
    try {
      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org,
      );

      const { jwt, addedToOrg } = await this._authService.routeAuth(
        body,
        ip,
        userAgent,
        getOrgFromCookie,
      );

      response.cookie("auth", jwt, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED
          ? {
              secure: true,
              httpOnly: true,
              sameSite: "none",
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });

      Sentry.metrics.count("new_user", 1);
      response.header("onboarding", "true");
      response.status(200).json({
        register: true,
      });
    } catch (error) {
      response.status(400).send(e.message);
    }
  }

  @Post("/login")
  async login(
    @Req() req: Request,
    @Res({ passthrough: false }) response: Response,
    @Body() body: CreateOrgUserDto,
    @RealIP() ip: string,
    @UserAgent() userAgent: string,
  ) {
    try {
      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org,
      );

      const { jwt, addedOrg } = await this._authService.routeAuth(
        body,
        ip,
        userAgent,
        getOrgFromCookie,
      );

      response.cookie("auth", jwt, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED
          ? {
              secure: true,
              httpOnly: true,
              sameSite: "none",
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, {
          domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
          ...(!process.env.NOT_SECURED
            ? {
                secure: true,
                httpOnly: true,
                sameSite: 'none',
              }
            : {}),
          expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
        });

        response.header('reload', 'true');
        response.status(200).json({
        login: true,
      });
    } catch (e) {

    }
  }

  async forgot() {}
}
