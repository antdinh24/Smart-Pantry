/**
 * RegisterScreen.tsx
 *
 * PURPOSE:
 *   Lets new users create a Smart Pantry account. Collects email, password,
 *   and a confirm password field (client-side only — we don't send it to
 *   the backend, it's just to catch typos). Calls AuthContext.signUp()
 *   which creates the account in Supabase and sets the user state.
 *
 * WHAT HAPPENS AFTER REGISTER:
 *   Same as login — signUp() updates `user` in AuthContext, and App.tsx
 *   automatically switches to the main app navigator. No manual navigation needed.
 *
 * NAVIGATION:
 *   - Tapping "Sign in instead" → LoginScreen
 *   - Successful registration → App.tsx handles the switch automatically
 *
 * VALIDATION (client-side, before hitting the network):
 *   1. Email must not be blank
 *   2. Password must be at least 6 characters (Supabase's minimum)
 *   3. Confirm password must match password
 *
 * DEPENDENCIES:
 *   - AuthContext (contexts/AuthContext.tsx) — provides signUp()
 */

import { useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { AuthStackParamList } from "../types/navigation"
import { useAuth } from "../contexts/AuthContext"

/** Typed navigation so TypeScript knows we're in the Auth stack */
type RegisterNav = NativeStackNavigationProp<AuthStackParamList, "Register">

export default function RegisterScreen() {
  const navigation = useNavigation<RegisterNav>()
  const { signUp } = useAuth()

  // ── Form field state ──────────────────────────────────────────────────────

  /** Email address entered by the user */
  const [email, setEmail] = useState("")

  /** Password entered by the user */
  const [password, setPassword] = useState("")

  /**
   * Second password entry — used only for client-side mismatch detection.
   * We never send this to the backend; Supabase only needs the password once.
   */
  const [confirmPassword, setConfirmPassword] = useState("")

  /** Controls whether the password field shows dots or plain text */
  const [passwordHidden, setPasswordHidden] = useState(true)

  /** Controls whether the confirm password field shows dots or plain text */
  const [confirmPasswordHidden, setConfirmPasswordHidden] = useState(true)

  /** True while the signUp() API call is in flight */
  const [loading, setLoading] = useState(false)

  /** Inline error message, or null if no error */
  const [error, setError] = useState<string | null>(null)

  /**
   * handleRegister
   *
   * Validates the form, then calls AuthContext.signUp().
   * On success: AuthContext updates `user`, App.tsx switches to the main navigator.
   * On failure: sets the error message so it appears inline.
   *
   * VALIDATION ORDER:
   *   We check the cheapest/most obvious errors first (blank fields) before
   *   checking the password match, and only hit the network if everything is valid.
   */
  const handleRegister = async () => {
    // Guard: email is required
    if (!email.trim()) {
      setError("Please enter your email address.")
      return
    }

    // Guard: Supabase requires passwords to be at least 6 characters
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    // Guard: passwords must match before we even try to register
    if (password !== confirmPassword) {
      setError("Passwords don't match. Please check and try again.")
      return
    }

    setError(null)
    setLoading(true)

    try {
      await signUp(email.trim(), password)
      // No navigation needed — App.tsx handles it when user state updates
    } catch (err: any) {
      /**
       * signUp() throws an Error with a message from Supabase.
       * Common messages: "User already registered", "Password should be at least 6 characters"
       */
      setError(err.message || "Registration failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Branding / header ── */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logo}>
                <Icon name="package" size={32} color="#ffffff" />
              </View>
            </View>
            <Text style={styles.appName}>Smart Pantry</Text>
            <Text style={styles.tagline}>Create your free account</Text>
          </View>

          {/* ── Form card ── */}
          <View style={styles.card}>

            {/* Email input */}
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputRow}>
              <Icon name="mail" size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            {/* Password input */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <Icon name="lock" size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor="#475569"
                secureTextEntry={passwordHidden}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <TouchableOpacity
                onPress={() => setPasswordHidden((h) => !h)}
                style={styles.eyeButton}
              >
                <Icon name={passwordHidden ? "eye" : "eye-off"} size={16} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Confirm password input */}
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputRow}>
              <Icon name="lock" size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat your password"
                placeholderTextColor="#475569"
                secureTextEntry={confirmPasswordHidden}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleRegister} /* tapping "Done" on keyboard submits the form */
              />
              <TouchableOpacity
                onPress={() => setConfirmPasswordHidden((h) => !h)}
                style={styles.eyeButton}
              >
                <Icon
                  name={confirmPasswordHidden ? "eye" : "eye-off"}
                  size={16}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>

            {/*
             * Live password match indicator — shown once the user starts
             * typing in the confirm field. Gives immediate feedback without
             * waiting for form submission.
             */}
            {confirmPassword.length > 0 && (
              <View style={styles.matchIndicator}>
                <Icon
                  name={password === confirmPassword ? "check-circle" : "x-circle"}
                  size={14}
                  color={password === confirmPassword ? "#10b981" : "#ef4444"}
                />
                <Text
                  style={[
                    styles.matchText,
                    { color: password === confirmPassword ? "#10b981" : "#ef4444" },
                  ]}
                >
                  {password === confirmPassword ? "Passwords match" : "Passwords don't match"}
                </Text>
              </View>
            )}

            {/* Inline error box — shown when validation fails or signup throws */}
            {error && (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={14} color="#ef4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Create Account button */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            {/* Terms note — small print below the button */}
            <Text style={styles.termsText}>
              By creating an account you agree to our Terms of Service and Privacy Policy.
            </Text>
          </View>

          {/* ── Login link ── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// (Same color palette as LoginScreen — keep consistent)
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1419",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 16,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#f8fafc",
    marginBottom: 6,
  },
  tagline: {
    fontSize: 15,
    color: "#94a3b8",
  },
  card: {
    backgroundColor: "#1a1f2e",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 24,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
    marginBottom: 8,
    marginTop: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f1419",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: "#f8fafc",
  },
  eyeButton: {
    padding: 4,
    marginLeft: 4,
  },

  /**
   * Small row shown below the confirm password field while the user is typing.
   * Green when passwords match, red when they don't.
   */
  matchIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  matchText: {
    fontSize: 12,
    fontWeight: "500",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 8,
    padding: 10,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#ef4444",
    lineHeight: 18,
  },

  primaryButton: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },

  /** Small disclaimer shown below the register button */
  termsText: {
    fontSize: 11,
    color: "#475569",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 16,
  },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#94a3b8",
  },
  footerLink: {
    fontSize: 14,
    fontWeight: "600",
    color: "#10b981",
  },
})
