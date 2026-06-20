'use client'

import { ArrowLeft, Check, Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import KrescoLogo from '@/components/KrescoLogo'
import { canSubmitOnboarding, type AuthPageController } from '@/lib/authPageController'
import { localizedCopy } from '@/lib/localization'

const NIVEAUX = [
  { id: '1bac', label: '1ere' },
  { id: '2bac', label: '2eme' },
]

const SPECIALITES = [
  'Sciences Mathématiques A',
  'Sciences Mathématiques B',
  'Sciences Physiques',
  'SVT',
  'Sciences Et Technologies Electriques',
  'Sciences Et Technologies Mécaniques',
  'Sciences Économiques',
  'Techniques De Gestion Et Comptabilité',
  'Sciences Agronomiques',
  'Lettres',
  'Langue Arabe',
  'Sciences De La Chariaa',
  'Arts Appliqués',
  'Autre',
]

const focusRingClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'
const buttonMotionClass = 'transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-200 ease-out active:scale-[0.99] disabled:active:scale-100'
const pageClass = 'relative flex min-h-[100svh] flex-col items-center justify-center overflow-y-auto bg-[var(--auth-bg)] px-5 py-6 sm:py-8'
const panelClass = 'flex w-full max-w-[380px] flex-col items-center'
const titleClass = 'mb-1 text-center text-[24px] font-bold text-[var(--auth-text)]'
const sectionTitleClass = 'mb-1.5 text-center text-[22px] font-bold text-[var(--auth-text)]'
const bodyClass = 'text-center text-[14px] leading-normal text-[var(--auth-text-muted)]'
const bodySpaciousClass = 'text-center text-[14px] leading-[1.5] text-[var(--auth-text-muted)]'
const inputClass = 'min-h-12 w-full rounded-[14px] border border-[var(--auth-input-border)] bg-[var(--auth-input-bg)] px-4 py-[13px] text-[14px] text-[var(--auth-text)] outline-none transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-[var(--auth-text-muted)] focus:border-[var(--auth-input-border-focus)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(69,61,238,0.12)]'
const labelClass = 'mb-1.5 block text-[13px] font-medium text-[var(--auth-text-hint)]'
const primaryButtonClass = `flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-[var(--auth-primary)] p-[14px] text-[15px] font-semibold text-white shadow-[0_8px_22px_rgba(69,61,238,0.18)] hover:bg-[#3a2fd3] disabled:cursor-not-allowed disabled:opacity-[0.45] disabled:shadow-none ${buttonMotionClass} ${focusRingClass}`
const outlineButtonClass = `min-h-12 w-full rounded-[14px] border border-[var(--auth-outline-border)] bg-transparent p-[13px] text-[14px] font-medium text-[var(--auth-text)] hover:border-[var(--auth-outline-hover)] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-[0.55] ${buttonMotionClass} ${focusRingClass}`
const ghostButtonClass = `min-h-11 rounded-[12px] border-0 bg-transparent px-2 text-[14px] text-[var(--auth-text-muted)] hover:text-[var(--auth-text)] ${buttonMotionClass} ${focusRingClass}`
const linkButtonClass = `rounded-md border-0 bg-transparent px-1 py-1 text-[14px] font-semibold text-[var(--auth-primary)] hover:text-[#3a2fd3] ${buttonMotionClass} ${focusRingClass}`
const formClass = 'flex w-full flex-col gap-3.5'
const socialRowClass = 'flex w-full gap-[11px]'
const progressTrackClass = 'mb-7 h-[3px] w-full overflow-hidden rounded-full bg-[var(--auth-divider)]'
const progressFillClass = 'h-full rounded-full bg-[var(--auth-primary)] transition-[width] duration-500 ease-out'
const hiddenGoogleClass = 'pointer-events-none absolute -left-[9999px] -top-[9999px] w-px overflow-hidden opacity-0'
const circleIconClass = 'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--auth-card-selected-bg)]'
const optionBaseClass = `flex w-full shrink-0 cursor-pointer items-center justify-between text-left ${buttonMotionClass} ${focusRingClass}`
const selectedOptionClass = 'border-[var(--auth-card-selected-border)] bg-[var(--auth-card-selected-bg)] text-[var(--auth-primary)] shadow-[0_8px_18px_rgba(69,61,238,0.08)]'
const unselectedOptionClass = 'border-[var(--auth-input-border)] bg-transparent text-[var(--auth-text)] hover:border-[var(--auth-outline-hover)] hover:bg-[#fafafa]'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.657 14.013 17.64 11.705 17.64 9.2z" fill="#4285f4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34a853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fbbc05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#ea4335"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#0866ff">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="16" height="19" viewBox="0 0 14 17" fill="currentColor">
      <path d="M13.4 12.5c-.3.8-.5 1.1-.9 1.8-.6.9-1.4 2-2.4 2-.9.1-1.2-.6-2.4-.6-1.2 0-1.5.6-2.4.6-1 0-1.9-1.1-2.4-2C1.4 11.8 1 9.5 1.9 7.7c.6-1.2 1.8-2 3-2 1.1 0 1.8.6 2.7.6.9 0 1.4-.7 2.7-.7 1.1 0 2.2.6 2.9 1.6-2.6 1.4-2.1 5-.8 5.3z"/>
      <path d="M9.7 3.5C10.2 2.9 10.6 2 10.5 1c-1 .1-2.1.7-2.8 1.4C7.2 3 6.8 4 6.9 5c1 0 2.1-.6 2.8-1.5z"/>
    </svg>
  )
}

function LoadingText({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      {label}
    </span>
  )
}

function SocialBtn({
  icon, label, onClick, disabled = false,
}: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cx('group relative h-12 flex-1 rounded-[14px] border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-[0.45]', buttonMotionClass, focusRingClass)}
    >
      <div className="absolute inset-0 rounded-[14px] bg-[#f4f4f5]" />
      <div className="absolute inset-0 flex items-center justify-center rounded-[14px] border border-[#e4e4e7] bg-white transition-[border-color,box-shadow] duration-200 group-hover:border-[var(--auth-outline-hover)] group-hover:shadow-[0_8px_18px_rgba(24,24,27,0.06)]">
        {icon}
      </div>
    </button>
  )
}

function OrDivider({ className = '' }: { className?: string }) {
  return (
    <div className={cx('flex w-full items-center gap-3', className)}>
      <div className="h-px flex-1 bg-[var(--auth-divider)]" />
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--auth-divider)]">{localizedCopy.auth.or}</span>
      <div className="h-px flex-1 bg-[var(--auth-divider)]" />
    </div>
  )
}

export function AuthPageView(controller: AuthPageController) {
  const {
    authMode,
    canGoBack,
    email,
    fullName,
    goBack,
    goToFiliere,
    googleReady,
    handleForgot,
    handleLogin,
    handleResend,
    handleSignup,
    hiddenGoogleRef,
    loading,
    password,
    pendingEmail,
    progressWidthClass,
    saveOnboarding,
    selectedLevel,
    selectedSpec,
    setEmail,
    setFullName,
    setPassword,
    setSelectedLevel,
    setSelectedSpec,
    setShowPassword,
    showForgot,
    showLogin,
    showOptions,
    showPassword,
    showSignup,
    step,
    triggerGoogle,
  } = controller

  return (
    <main className={pageClass} aria-busy={loading}>
      <div ref={hiddenGoogleRef} className={hiddenGoogleClass} />

      <div className={panelClass}>
        <div className={progressTrackClass}>
          <div className={cx(progressFillClass, progressWidthClass)} />
        </div>

        {canGoBack && (
          <button
            type="button"
            onClick={goBack}
            className={cx('mb-4 flex min-h-10 items-center gap-1.5 self-start rounded-[12px] border-0 bg-transparent px-1 text-[14px] text-[var(--auth-text-muted)] hover:text-[var(--auth-text)]', buttonMotionClass, focusRingClass)}
          >
            <ArrowLeft size={15} aria-hidden="true" /> Retour
          </button>
        )}

        <KrescoLogo size={52} className="mb-5" />

        {step === 'auth' && (
          <>
            {authMode === 'options' && (
              <>
                <h1 className={titleClass}>{localizedCopy.auth.welcome}</h1>
                <p className={cx(bodySpaciousClass, 'mb-7')}>
                  {localizedCopy.auth.loginToAccess}
                </p>

                <div className={cx(socialRowClass, 'mb-1')}>
                  <SocialBtn icon={<GoogleIcon />} label={localizedCopy.auth.continueWithGoogle} onClick={triggerGoogle} disabled={!googleReady || loading} />
                  <SocialBtn icon={<FacebookIcon />} label={localizedCopy.auth.facebookComingSoon} disabled />
                  <SocialBtn icon={<AppleIcon />} label={localizedCopy.auth.appleComingSoon} disabled />
                </div>

                {loading && (
                  <p className="mt-2 inline-flex items-center gap-2 text-[12px] text-[var(--auth-text-muted)]" role="status">
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                    {localizedCopy.auth.loginLoading}
                  </p>
                )}

                <OrDivider className="my-5" />

                <button type="button" onClick={showSignup} className={outlineButtonClass}>
                  {localizedCopy.auth.createAccount}
                </button>
                <button type="button" onClick={showLogin} className={cx(ghostButtonClass, 'mt-3.5')}>
                  {localizedCopy.auth.alreadyHaveAccount} <span className="font-semibold text-[var(--auth-primary)]">{localizedCopy.auth.loginAction}</span>
                </button>
              </>
            )}

            {authMode === 'signup' && (
              <>
                <h1 className={titleClass}>{localizedCopy.auth.signUpTitle}</h1>
                <p className={cx(bodyClass, 'mb-6')}>{localizedCopy.auth.joinFree}</p>

                <div className={cx(socialRowClass, 'mb-5')}>
                  <SocialBtn icon={<GoogleIcon />} label={localizedCopy.auth.google} onClick={triggerGoogle} disabled={!googleReady || loading} />
                  <SocialBtn icon={<FacebookIcon />} label={localizedCopy.auth.facebook} disabled />
                  <SocialBtn icon={<AppleIcon />} label={localizedCopy.auth.apple} disabled />
                </div>

                <OrDivider className="mb-5" />

                <form onSubmit={handleSignup} className={formClass}>
                  <div>
                    <label htmlFor="signup-full-name" className={labelClass}>{localizedCopy.auth.fullName}</label>
                    <input id="signup-full-name" aria-label={localizedCopy.auth.fullName} type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder={localizedCopy.auth.fullNamePlaceholder} required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="signup-email" className={labelClass}>{localizedCopy.auth.email}</label>
                    <input id="signup-email" aria-label={localizedCopy.auth.email} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={localizedCopy.auth.emailPlaceholder} required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="signup-password" className={labelClass}>{localizedCopy.auth.password}</label>
                    <div className="relative">
                      <input id="signup-password" aria-label={localizedCopy.auth.password} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder={localizedCopy.auth.passwordMinPlaceholder} required minLength={8}
                        className={cx(inputClass, 'pr-11')} />
                      <button type="button" aria-label={showPassword ? localizedCopy.auth.hidePassword : localizedCopy.auth.showPassword} onClick={() => setShowPassword(v => !v)}
                        className={cx('absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent text-[var(--auth-text-muted)] hover:bg-white hover:text-[var(--auth-text)]', buttonMotionClass, focusRingClass)}>
                        {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={cx(primaryButtonClass, 'mt-1')}>
                    {loading ? <LoadingText label={localizedCopy.auth.creating} /> : localizedCopy.auth.createAccountAction}
                  </button>
                </form>
                <p className="mt-[18px] text-[14px] text-[var(--auth-text-muted)]">
                  {localizedCopy.auth.alreadyHaveAccount}{' '}
                  <button type="button" onClick={showLogin} className={linkButtonClass}>
                    {localizedCopy.auth.loginAction}
                  </button>
                </p>
              </>
            )}

            {authMode === 'verify-pending' && (
              <div className="w-full text-center">
                <div className={circleIconClass}>
                  <Mail size={28} color="var(--auth-primary)" aria-hidden="true" />
                </div>
                <h1 className={cx(sectionTitleClass, 'mb-2.5')}>{localizedCopy.auth.verifyEmailTitle}</h1>
                <p className="mb-7 text-[14px] leading-[1.6] text-[var(--auth-text-muted)]">
                  {localizedCopy.auth.verifyEmailBody1} <strong className="text-[var(--auth-text)]">{pendingEmail}</strong>.
                  <br />{localizedCopy.auth.verifyEmailBody2}
                </p>
                <button type="button" onClick={handleResend} disabled={loading} className={cx(outlineButtonClass, 'mb-3.5 disabled:opacity-[0.6]')}>
                  {loading ? <LoadingText label={localizedCopy.auth.resending} /> : localizedCopy.auth.resendEmail}
                </button>
                <button type="button" onClick={showOptions} className={ghostButtonClass}>
                  {localizedCopy.auth.backToHome}
                </button>
              </div>
            )}

            {authMode === 'login' && (
              <>
                <h1 className={titleClass}>{localizedCopy.auth.logInTitle}</h1>
                <p className={cx(bodyClass, 'mb-6')}>{localizedCopy.auth.welcomeBack}</p>

                <div className={cx(socialRowClass, 'mb-5')}>
                  <SocialBtn icon={<GoogleIcon />} label={localizedCopy.auth.google} onClick={triggerGoogle} disabled={!googleReady || loading} />
                  <SocialBtn icon={<FacebookIcon />} label={localizedCopy.auth.facebook} disabled />
                  <SocialBtn icon={<AppleIcon />} label={localizedCopy.auth.apple} disabled />
                </div>

                <OrDivider className="mb-5" />

                <form onSubmit={handleLogin} className={formClass}>
                  <div>
                    <label htmlFor="login-email" className={labelClass}>{localizedCopy.auth.email}</label>
                    <input id="login-email" aria-label={localizedCopy.auth.email} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={localizedCopy.auth.emailPlaceholder} required className={inputClass} />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="login-password" className="block text-[13px] font-medium text-[var(--auth-text-hint)]">{localizedCopy.auth.password}</label>
                      <button type="button" onClick={showForgot} className={cx('rounded-md border-0 bg-transparent px-1 py-1 text-[12px] font-medium text-[var(--auth-primary)] hover:text-[#3a2fd3]', buttonMotionClass, focusRingClass)}>
                        {localizedCopy.auth.forgotPassword}
                      </button>
                    </div>
                    <div className="relative">
                      <input id="login-password" aria-label={localizedCopy.auth.password} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder={localizedCopy.auth.passwordPlaceholder} required
                        className={cx(inputClass, 'pr-11')} />
                      <button type="button" aria-label={showPassword ? localizedCopy.auth.hidePassword : localizedCopy.auth.showPassword} onClick={() => setShowPassword(v => !v)}
                        className={cx('absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent text-[var(--auth-text-muted)] hover:bg-white hover:text-[var(--auth-text)]', buttonMotionClass, focusRingClass)}>
                        {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={cx(primaryButtonClass, 'mt-1')}>
                    {loading ? <LoadingText label={localizedCopy.auth.loginLoading} /> : localizedCopy.auth.loginAction}
                  </button>
                </form>

                <p className="mt-[18px] text-[14px] text-[var(--auth-text-muted)]">
                  {localizedCopy.auth.noAccountYet}{' '}
                  <button type="button" onClick={showSignup} className={linkButtonClass}>
                    {localizedCopy.auth.createAccount}
                  </button>
                </p>
              </>
            )}

            {authMode === 'forgot' && (
              <>
                <h1 className={sectionTitleClass}>{localizedCopy.auth.forgotPasswordTitle}</h1>
                <p className={cx(bodySpaciousClass, 'mb-6')}>
                  {localizedCopy.auth.forgotPasswordBody}
                </p>
                <form onSubmit={handleForgot} className={formClass}>
                  <div>
                    <label htmlFor="forgot-email" className={labelClass}>{localizedCopy.auth.email}</label>
                    <input id="forgot-email" aria-label={localizedCopy.auth.email} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={localizedCopy.auth.emailPlaceholder} required className={inputClass} />
                  </div>
                  <button type="submit" disabled={loading} className={cx(primaryButtonClass, 'mt-1')}>
                    {loading ? <LoadingText label={localizedCopy.auth.resending} /> : localizedCopy.auth.sendLink}
                  </button>
                </form>
                <button type="button" onClick={showLogin} className={cx(linkButtonClass, 'mt-[18px] font-medium')}>
                  {localizedCopy.auth.backToLogin}
                </button>
              </>
            )}

            {authMode === 'forgot-sent' && (
              <div className="w-full text-center">
                <div className={circleIconClass}>
                  <Check size={28} color="var(--auth-primary)" aria-hidden="true" />
                </div>
                <h1 className={cx(sectionTitleClass, 'mb-2.5')}>{localizedCopy.auth.emailSentTitle}</h1>
                <p className="mb-7 text-[14px] leading-[1.6] text-[var(--auth-text-muted)]">
                  {localizedCopy.auth.emailSentBody}
                </p>
                <button type="button" onClick={showLogin} className={primaryButtonClass}>
                  {localizedCopy.auth.backToLogin}
                </button>
              </div>
            )}
          </>
        )}

        {step === 'niveau' && (
          <>
            <h1 className={sectionTitleClass}>{localizedCopy.auth.whatLevel}</h1>
            <p className={cx(bodyClass, 'mb-7')}>{localizedCopy.auth.helpsUsPersonalize}</p>
            <div className="mb-7 flex w-full flex-col gap-3">
              {NIVEAUX.map(n => {
                const selected = selectedLevel === n.id
                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => setSelectedLevel(n.id)}
                    aria-pressed={selected}
                    className={cx(
                      optionBaseClass,
                      'rounded-[14px] border-2 px-5 py-4 text-[15px] font-medium',
                      selected ? selectedOptionClass : unselectedOptionClass,
                    )}
                  >
                    {n.label}
                    {selected && <Check size={16} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={goToFiliere} disabled={!selectedLevel} className={primaryButtonClass}>
              {localizedCopy.auth.continueBtn}
            </button>
          </>
        )}

        {step === 'filiere' && (
          <>
            <h1 className={sectionTitleClass}>{localizedCopy.auth.whatSpecialty}</h1>
            <p className={cx(bodyClass, 'mb-5')}>{localizedCopy.auth.selectSpecialty}</p>
            <div className="mb-6 flex max-h-[360px] w-full flex-col gap-2 overflow-y-auto pr-1">
              {SPECIALITES.map(spec => {
                const selected = selectedSpec === spec
                return (
                  <button
                    type="button"
                    key={spec}
                    onClick={() => setSelectedSpec(spec)}
                    aria-pressed={selected}
                    className={cx(
                      optionBaseClass,
                      'rounded-xl border-2 px-4 py-[13px] text-[14px]',
                      selected ? cx(selectedOptionClass, 'font-semibold') : cx(unselectedOptionClass, 'font-normal'),
                    )}
                  >
                    {spec}
                    {selected && <Check size={14} className="shrink-0" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={saveOnboarding} disabled={!canSubmitOnboarding(selectedLevel, selectedSpec, loading)} className={primaryButtonClass}>
              {loading ? <LoadingText label={localizedCopy.auth.saving} /> : localizedCopy.auth.start}
            </button>
          </>
        )}
      </div>

      <p className="mt-8 max-w-[360px] px-2 text-center text-[12px] leading-[1.5] text-[var(--auth-text-muted)]">
        {localizedCopy.auth.termsSummary}
      </p>
    </main>
  )
}
