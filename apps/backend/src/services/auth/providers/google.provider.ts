import {
  AuthProvider,
  AuthProviderAbstract,
} from "@docgpt/backend/services/auth/provider.interface";

@AuthProvider({ provider: "google" })
class GoogleAuthProvider extends AuthProviderAbstract {
  generateLink(): string {}
  getToken(): string {}
  getUser(): { email: string; id: string } {}
}
