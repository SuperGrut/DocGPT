import { AuthService } from "@docgpt/backend/services/auth/auth.service";
import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { Response, Request } from "express";
import { RealIP } from "nestjs-real-ip";
import { UserAgent } from "@docgpt/nestjs-libraries/user/user.agent.decorator";
import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";
import { UsersService } from "@docgpt/nestjs-libraries/database/prisma/users/users.service";

@Controller("auth")
export class AuthController {
  constructor(
    private _authService: AuthService,
    private _usersService: UsersService,
  ) {}

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

      if (typeof addedOrg !== "boolean" && addedOrg?.organizationId) {
        response.cookie("showorg", addedOrg.organizationId, {
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

        response.header("reload", "true");
        response.status(200).json({
          login: true,
        });
      }
    } catch (e) {
      response.status(400).send(e.message);
    }
  }

  @Post("/forgot")
  async forgot(email: string) {
    const user = await this._usersService.getUserByEmail(email);
    if (!user || user.providerName !== Provider.LOCAL) {
      return false;
    }

    const resetValues = AuthChecker.signJWT({
      id: user.id,
      expires: dayjs().add(20, "minutes").format("YYYY-MM-DD HH:mm:ss"),
    });

    await this._emailService.sendEmailSync(
      user.email,
      "Reset your password",
      `You have requested to reset your password. <br />Click <a href="${process.env.FRONTEND_URL}/auth/forgot/${resetValues}">here</a> to reset your password<br />The link will expire in 20 minutes`,
    );
  }

  @Post("/forgot-return")
  async forgotReturn(@Body() body: ForgotReturnPasswordDto) {
    const reset = await this._authService.forgotReturn(body);
    return {
      reset: !!reset,
    };
  }

  @Post("/activate")
  async activate(
    @Body("code") code: string,
    @Body("datafast_visitor_id") datafast_visitor_id: string,
    @Res({ passthrough: false }) response: Response,
  ) {
    const activate = await this._authService.activate(
      code,
      datafast_visitor_id,
    );
    if (!activate) {
      return response.status(200).json({ can: false });
    }

    response.cookie("auth", activate, {
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

    if (process.env.NOT_SECURED) {
      response.header("auth", activate);
    }

    response.header("onboarding", "true");

    return response.status(200).json({ can: true });
  }
}
