'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { LazyBoundary } from '@/components/ui/LazyBoundary'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// The forms need the Supabase browser client, so they load only once the
// dialog opens instead of shipping in every page's bundle.
const formLoading = () => (
  <div className="flex justify-center py-6">
    <Spinner className="size-6" label="Loading" />
  </div>
)

const SignInForm = dynamic(() => import('./AuthForms').then((m) => m.SignInForm), { ssr: false, loading: formLoading })
const SignUpForm = dynamic(() => import('./AuthForms').then((m) => m.SignUpForm), { ssr: false, loading: formLoading })
const VerifyStep = dynamic(() => import('./AuthForms').then((m) => m.VerifyStep), { ssr: false, loading: formLoading })

// Warm the form chunk when the trigger is hovered or focused, so the dialog
// opens without a spinner on the usual path.
const preloadAuthForms = () => { void import('./AuthForms') }

type AuthMode = 'signin' | 'signup'
type AuthStep = 'details' | 'verify' | 'redirecting'

interface AuthDialogProps {
  /** Where to redirect after successful sign-in */
  redirect?: string
  /** Button size variant */
  size?: 'xs' | 'sm' | 'default'
  /** Optional custom trigger. Receives a function to open the sign-in dialog. */
  trigger?: (openSignIn: () => void) => React.ReactNode
  /** Displayed in the signup form description */
  leagueName?: string
  /** Defaults to 'signin' */
  initialMode?: AuthMode
  /** Controlled open state (optional) */
  open?: boolean
  /** Controlled open change handler (optional) */
  onOpenChange?: (open: boolean) => void
  signinOnly?: boolean
}

const TITLES: Record<AuthMode, string> = {
  signin: 'Sign in',
  signup: 'Create account',
}

function getDescription(mode: AuthMode, leagueName?: string): string {
  if (mode === 'signup') {
    return leagueName
      ? `Create an account to request access to ${leagueName}.`
      : 'Create your Boot Room account.'
  }
  return 'Sign in to access your leagues.'
}

export function AuthDialog({
  redirect = '/',
  size = 'xs',
  trigger,
  leagueName,
  initialMode = 'signin',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  signinOnly,
}: AuthDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [step, setStep] = useState<AuthStep>('details')
  const [email, setEmail] = useState('')

  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen

  function openAs(m: AuthMode) {
    setMode(m)
    setStep('details')
    setEmail('')
    setOpen(true)
  }

  function handleOpenChange(next: boolean) {
    if (step === 'redirecting') return
    if (!next) {
      setStep('details')
      setEmail('')
    }
    setOpen(next)
  }

  function handleCodeSent(sentEmail: string) {
    setEmail(sentEmail)
    setStep('verify')
  }

  function handleBack() {
    setStep('details')
    setEmail('')
  }

  function handleSwitchMode() {
    if (signinOnly) return
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setStep('details')
    setEmail('')
  }

  const dialogTitle =
    step === 'redirecting' ? 'Signing you in' : step === 'verify' ? 'Check your email' : TITLES[mode]
  const dialogDescription =
    step === 'redirecting'
      ? 'Taking you to your league.'
      : step === 'verify'
        ? `Enter the 6-digit code we sent to ${email}`
        : getDescription(mode, leagueName)

  return (
    <>
      {!isControlled && (
        trigger ? (
          trigger(() => openAs('signin'))
        ) : (
          <Button
            size={size}
            variant="outline"
            onClick={() => openAs('signin')}
            onPointerEnter={preloadAuthForms}
            onFocus={preloadAuthForms}
          >
            Log in
          </Button>
        )
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <LazyBoundary
            fallback={
              <p className="mt-4 text-sm text-[#e2686f]">
                Could not load the sign-in form. Refresh the page and try again.
              </p>
            }
          >
            {step === 'redirecting' ? (
              <div className="flex justify-center py-6">
                <Spinner className="size-6" label="Signing you in" />
              </div>
            ) : step === 'verify' ? (
              <VerifyStep
                email={email}
                onBack={handleBack}
                onVerified={() => setStep('redirecting')}
                redirect={redirect}
              />
            ) : mode === 'signin' ? (
              <SignInForm onSent={handleCodeSent} onSwitchMode={handleSwitchMode} signinOnly={signinOnly} />
            ) : (
              <SignUpForm
                onSent={handleCodeSent}
                onSwitchMode={handleSwitchMode}
                leagueName={leagueName}
              />
            )}
          </LazyBoundary>
        </DialogContent>
      </Dialog>
    </>
  )
}
