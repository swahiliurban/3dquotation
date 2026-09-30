import { LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { normalizeBusinessProfile } from "../lib/documents";
import { useQuoteFlowStore } from "../store/useQuoteFlowStore";

interface SignupFormValues {
  name: string;
  email: string;
  phone: string;
}

interface LoginFormValues {
  email: string;
  phone: string;
}

export function AuthPage() {
  const navigate = useNavigate();
  const connectBusinessIdentity = useQuoteFlowStore((state) => state.connectBusinessIdentity);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const signupForm = useForm<SignupFormValues>({
    defaultValues: { name: "", email: "", phone: "" },
  });
  const loginForm = useForm<LoginFormValues>({
    defaultValues: { email: "", phone: "" },
  });

  async function handleSignup(values: SignupFormValues) {
    try {
      const result = await connectBusinessIdentity({
        email: values.email,
        phone: values.phone,
        seedProfile: normalizeBusinessProfile({
          name: values.name,
          email: values.email,
          phone: values.phone,
        }),
      });
      toast.success(result.workspaceExists ? "Saved business workspace loaded." : "Business workspace created.");
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that business workspace.");
    }
  }

  async function handleLogin(values: LoginFormValues) {
    try {
      const result = await connectBusinessIdentity({
        email: values.email,
        phone: values.phone,
      });
      toast.success(result.workspaceExists ? "Saved business workspace loaded." : "Business workspace created.");
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that business workspace.");
    }
  }

  return (
    <div className="min-h-screen bg-sand-50 text-slate-900 transition dark:bg-slate-950 dark:text-slate-100">
      <div className="min-h-screen bg-grid px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl items-center justify-center">
          <Card className="w-full rounded-[32px] p-5 sm:p-7 md:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600 dark:text-brand-200">
                QuoteFlow account
              </p>
              <h1 className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white sm:text-4xl">
                {mode === "signup" ? "Create your account" : "Log in to QuoteFlow"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-300">
                {mode === "signup"
                  ? "Start or recover a business workspace with your business email and phone number."
                  : "Use the same business email and phone number to open your saved workspace."}
              </p>
            </div>

            <div className="mt-6 rounded-[22px] bg-slate-100 p-1 dark:bg-white/5">
              <button
                className={`w-1/2 rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
                  mode === "signup"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                    : "text-slate-500 dark:text-slate-300"
                }`}
                onClick={() => setMode("signup")}
                type="button"
              >
                Sign up
              </button>
              <button
                className={`w-1/2 rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
                  mode === "login"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                    : "text-slate-500 dark:text-slate-300"
                }`}
                onClick={() => setMode("login")}
                type="button"
              >
                Log in
              </button>
            </div>

            <div className="mt-6">
              {mode === "signup" ? (
                <form className="space-y-4" onSubmit={signupForm.handleSubmit(handleSignup)}>
                  <div>
                    <label className="form-label">Business or full name</label>
                    <input
                      className="form-input"
                      autoComplete="name"
                      placeholder="Business or owner name"
                      {...signupForm.register("name", {
                        required: "Enter your business name or full name.",
                        minLength: { value: 2, message: "Name is too short." },
                      })}
                    />
                    {signupForm.formState.errors.name ? (
                      <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">
                        {signupForm.formState.errors.name.message}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="form-label">Email</label>
                    <input
                      className="form-input"
                      autoComplete="email"
                      placeholder="name@example.com"
                      type="email"
                      {...signupForm.register("email", {
                        required: "Enter a valid email address.",
                        pattern: {
                          value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                          message: "Enter a valid email address.",
                        },
                      })}
                    />
                    {signupForm.formState.errors.email ? (
                      <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">
                        {signupForm.formState.errors.email.message}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="form-label">Phone number</label>
                    <input
                      className="form-input"
                      autoComplete="tel"
                      placeholder="+255700000000"
                      {...signupForm.register("phone", {
                        required: "Enter a phone number.",
                        minLength: { value: 7, message: "Phone number is too short." },
                      })}
                    />
                    {signupForm.formState.errors.phone ? (
                      <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">
                        {signupForm.formState.errors.phone.message}
                      </p>
                    ) : null}
                  </div>
                  <Button icon={<UserPlus size={16} />} stretch type="submit">
                    Open workspace
                  </Button>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={loginForm.handleSubmit(handleLogin)}>
                  <div>
                    <label className="form-label">Email</label>
                    <input
                      className="form-input"
                      autoComplete="email"
                      placeholder="name@example.com"
                      type="email"
                      {...loginForm.register("email", {
                        required: "Enter your email address.",
                        pattern: {
                          value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                          message: "Enter a valid email address.",
                        },
                      })}
                    />
                    {loginForm.formState.errors.email ? (
                      <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">
                        {loginForm.formState.errors.email.message}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="form-label">Phone number</label>
                    <input
                      className="form-input"
                      autoComplete="tel"
                      placeholder="+255700000000"
                      {...loginForm.register("phone", {
                        required: "Enter the business phone number.",
                        minLength: { value: 7, message: "Phone number is too short." },
                      })}
                    />
                    {loginForm.formState.errors.phone ? (
                      <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">
                        {loginForm.formState.errors.phone.message}
                      </p>
                    ) : null}
                  </div>
                  <Button icon={<LogIn size={16} />} stretch type="submit">
                    Open workspace
                  </Button>
                </form>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
