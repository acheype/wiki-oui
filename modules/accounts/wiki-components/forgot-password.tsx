import { ForgotPasswordForm } from "../ui/forgot-password-form";
import { isMailerConfigured } from "@/modules/accounts/link/mailer";

// Built-in component rendered by the `mot-de-passe-oublie` special page (ADR
// 0028). Whether the wiki can send anything is decided here, on the server,
// so the system page promises a mail only where one will actually leave.
export function ForgotPassword() {
  return (
    <div className="not-prose mx-auto w-full max-w-sm py-6">
      <ForgotPasswordForm canSendMail={isMailerConfigured()} />
    </div>
  );
}
