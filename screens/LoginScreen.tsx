/**
 * LoginScreen.tsx
 *
 * PURPOSE:
 *   The entry point for returning users. Collects email and password,
 *   then calls AuthContext.signIn() which authenticates against Supabase
 *   and stores the JWT token in SecureStore for future API calls.
 *
 * WHAT HAPPENS AFTER LOGIN:
 *   signIn() updates the `user` state in AuthContext. App.tsx watches that
 *   state — when `user` becomes non-null, it automatically switches the
 *   navigator from the Auth stack to the main App stack. No explicit
 *   navigation.navigate() call is needed here.
 *
 * NAVIGATION:
 *   - Tapping "Create an account" → RegisterScreen
 *   - Successful login → App.tsx handles the switch automatically
 *
 * DEPENDENCIES:
 *   - AuthContext (contexts/AuthContext.tsx) — provides signIn()
 *   - expo-secure-store (via StorageService) — token is saved inside signIn()
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

/** Typed navigation so TypeScript knows which screens we can navigate to from here */
type LoginNav = NativeStackNavigationProp<AuthStackParamList, "Login">

export default function LoginScreen() {
  const navigation = useNavigation<LoginNav>()

  /**
   * useAuth() gives us access to signIn() and the loading state from AuthContext.
   * We don't need `user` here because App.tsx handles the redirect once user is set.
   */
  const { signIn, signInAsGuest } = useAuth()

  // ── Form field state ──────────────────────────────────────────────────────

  /** The email the user is typing */
  const [email, setEmail] = useState("")

  /** The password the user is typing */
  const [password, setPassword] = useState("")

  /**
   * Whether the password characters are hidden (shown as dots).
   * Starts true (hidden). User can toggle with the eye icon.
   */
  const [passwordHidden, setPasswordHidden] = useState(true)

  /**
   * True while the signIn() API call is in flight.
   * Used to show a spinner and disable the button to prevent double-submits.
   */
  const [loading, setLoading] = useState(false)

  /**
   * Holds an error message to show below the form if login fails.
   * Null when there's no error (nothing is shown).
   */
  const [error, setError] = useState<string | null>(null)

  /**
   * handleGuestSignIn
   *
   * Calls AuthContext.signInAsGuest() which creates an anonymous Supabase session.
   * On success, App.tsx sees the non-null user and switches to the main app stack.
   * Recipe generation and receipt scanning are blocked inside those screens.
   */
  const handleGuestSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      await signInAsGuest()
    } catch (err: any) {
      setError(err.message || 'Guest sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * handleSignIn
   *
   * Validates inputs, then calls AuthContext.signIn().
   * On success: AuthContext updates `user`, App.tsx sees the change and
   *   switches to the main app navigator automatically.
   * On failure: sets the error message so it appears inline on the form.
   *
   * WHY clear error at the start?
   *   If the user failed once and then tries again, we don't want the old
   *   error sitting there while the new attempt is loading.
   */
  const handleSignIn = async () => {
    // Basic client-side validation before hitting the network
    if (!email.trim()) {
      setError("Please enter your email address.")
      return
    }
    if (!password) {
      setError("Please enter your password.")
      return
    }

    setError(null)   // clear any previous error
    setLoading(true)

    try {
      await signIn(email.trim(), password)
      // No navigation needed here — App.tsx handles it when user state updates
    } catch (err: any) {
      /**
       * signIn() throws an Error with a message from Supabase.
       * We show that message directly — Supabase messages like
       * "Invalid login credentials" are user-friendly enough.
       */
      setError(err.message || "Sign in failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/*
       * KeyboardAvoidingView pushes the form up when the keyboard opens
       * so the inputs don't get hidden behind it.
       * behavior="padding" works better on iOS; Android handles this natively.
       */}
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
            <Text style={styles.tagline}>Sign in to your account</Text>
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
                autoCapitalize="none"   /* email addresses are lowercase */
                autoCorrect={false}     /* don't autocorrect email addresses */
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
                placeholder="Your password"
                placeholderTextColor="#475569"
                secureTextEntry={passwordHidden}  /* hides characters when true */
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}    /* allows tapping "Done" on keyboard to submit */
              />
              {/* Toggle password visibility */}
              <TouchableOpacity
                onPress={() => setPasswordHidden((h) => !h)}
                style={styles.eyeButton}
              >
                <Icon
                  name={passwordHidden ? "eye" : "eye-off"}
                  size={16}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>

            {/*
             * Error message — only rendered when `error` is not null.
             * Appears between the form fields and the submit button so
             * the user sees it before tapping again.
             */}
            {error && (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={14} color="#ef4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Sign In button */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleSignIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Register link ── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Register")}>
              <Text style={styles.footerLink}>Create one</Text>
            </TouchableOpacity>
          </View>

          {/* ── Guest access ── */}
          <View style={styles.guestSection}>
            {/*
             * Divider row — a horizontal line with "or" in the middle.
             * Visually separates the primary auth actions from the guest option,
             * which is a lower-commitment path.
             */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/*
             * Guest button — styled as an outlined ghost button, not the filled
             * green primary style, to signal it's a lesser action than Sign In.
             * Disabled while loading to prevent double-taps.
             */}
            <TouchableOpacity
              style={[styles.guestButton, loading && styles.guestButtonDisabled]}
              onPress={handleGuestSignIn}
              disabled={loading}
            >
              <Icon name="user" size={16} color="#64748b" />
              <Text style={styles.guestButtonText}>Continue as Guest</Text>
            </TouchableOpacity>

            {/* Clarify what "guest" means so there's no confusion about data loss */}
            <Text style={styles.guestNote}>
              Guest sessions are temporary. Create an account to keep your data.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
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
    flexGrow: 1,               /* ensures content can fill screen even if short */
    justifyContent: "center",  /* vertically centers the form on tall screens */
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  // ── Branding ──────────────────────────────────────────────────────────────

  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 16,
  },
  /** Green circle with the app icon */
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

  // ── Form card ─────────────────────────────────────────────────────────────

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

  /**
   * inputRow wraps the icon + TextInput + optional eye button together
   * so they appear as a single unified input field.
   */
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

  /**
   * flex: 1 makes the TextInput fill the remaining width of the inputRow
   * after the icon (and optional eye button) take their space.
   */
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

  /** Red error box shown below inputs when sign-in fails */
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

  // ── Footer link ───────────────────────────────────────────────────────────

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

  // ── Guest access ──────────────────────────────────────────────────────────

  guestSection: {
    marginTop: 8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#334155",
  },
  dividerText: {
    fontSize: 13,
    color: "#475569",
    marginHorizontal: 12,
  },
  /** Outlined ghost style — less prominent than the filled green Sign In button */
  guestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 10,
  },
  guestButtonDisabled: {
    opacity: 0.5,
  },
  guestButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#94a3b8",
  },
  guestNote: {
    fontSize: 12,
    color: "#475569",
    textAlign: "center",
    lineHeight: 17,
  },
})
