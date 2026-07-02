'use client'

import Image from 'next/image'
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  MessageCircle,
  PlayCircle,
  Radio,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from 'framer-motion'

import KrescoWordmark from '@/components/KrescoWordmark'

type LandingProps = {
  onLogin: () => void
  onSignup: () => void
}

type Feature = {
  title: string
  body: string
  icon: LucideIcon
}

const strengths: Feature[] = [
  {
    title: 'Cours video structures',
    body: "Chaque notion avance dans l'ordre du programme Bac, sans chercher dans dix endroits.",
    icon: PlayCircle,
  },
  {
    title: 'Exercices corriges',
    body: 'Tu passes vite de "j\'ai compris" a "je sais le refaire seul".',
    icon: ClipboardCheck,
  },
  {
    title: 'Examens blancs',
    body: "Des sujets pour t'entrainer comme le jour J, avec les bonnes priorites.",
    icon: Target,
  },
  {
    title: 'Live et professeurs',
    body: 'Quand tu bloques, tu peux revenir vers un vrai accompagnement.',
    icon: Radio,
  },
  {
    title: 'Planning de revision',
    body: 'Ton calendrier garde le rythme visible, meme pendant les semaines chargees.',
    icon: CalendarDays,
  },
  {
    title: 'Classement et progression',
    body: "Tu vois ce qui avance, ce qui manque, et ou concentrer l'effort.",
    icon: Trophy,
  },
]

const methodSteps = [
  {
    title: 'Tu ouvres Kresco, tu sais quoi faire.',
    body: 'Le parcours indique la prochaine lecon, les exercices utiles et les revisions a reprendre.',
    stat: '01',
  },
  {
    title: "Tu pratiques avant de croire que c'est acquis.",
    body: 'Quiz, exercices, corrections et examens blancs transforment le cours en reflexes.',
    stat: '02',
  },
  {
    title: 'Tu gardes le contact quand ca coince.',
    body: "Live, chat professeur et suivi t'aident a corriger les blocages avant qu'ils s'accumulent.",
    stat: '03',
  },
]

const proofPoints = [
  'Programme pense pour le Bac marocain',
  'Revision mobile, ordinateur, ou tablette',
  'Connexion Google et email',
  'Onboarding niveau + filiere',
]

const faqItems = [
  {
    question: 'Est-ce que Kresco remplace mes cours ?',
    answer: "Non. Kresco organise ta revision, renforce les notions et t'aide a pratiquer regulierement. Tu gardes tes cours, mais tu sais mieux quoi travailler.",
  },
  {
    question: 'Je peux commencer sans payer ?',
    answer: "Oui, l'inscription te permet de demarrer ton espace. Les offres avancees se debloquent selon l'accompagnement choisi.",
  },
  {
    question: "C'est fait pour quelles filieres ?",
    answer: "L'onboarding te demande ton niveau et ta filiere pour adapter ton espace. Le contenu se concentre sur les besoins des eleves Bac au Maroc.",
  },
]

const navigation = [
  { href: '#methode', label: 'Methode' },
  { href: '#outils', label: 'Outils' },
  { href: '#offre', label: 'Offre' },
  { href: '#faq', label: 'FAQ' },
]

const noiseStyle = {
  backgroundImage: 'radial-gradient(rgba(255,255,255,0.22) 0.7px, transparent 0.7px)',
  backgroundSize: '4px 4px',
}

function makeReveal(shouldReduceMotion: boolean): Variants {
  return {
    hidden: {
      opacity: 0.98,
      y: shouldReduceMotion ? 0 : 18,
      filter: 'none',
    },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.52,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  }
}

function makeHeroReveal(shouldReduceMotion: boolean): Variants {
  return {
    hidden: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 22,
      filter: shouldReduceMotion ? 'none' : 'blur(6px)',
    },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.52,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  }
}

export default function KrescoLandingExperience({ onLogin, onSignup }: LandingProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const { scrollYProgress } = useScroll()
  const progressScale = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.18 })
  const heroY = useTransform(scrollYProgress, [0, 0.26], shouldReduceMotion ? [0, 0] : [0, -42])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.22], shouldReduceMotion ? [1, 1] : [1, 0.74])
  const reveal = makeReveal(shouldReduceMotion)
  const heroReveal = makeHeroReveal(shouldReduceMotion)

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen overflow-hidden bg-[#f7f8fb] text-[#18181b]">
      <motion.div
        aria-hidden="true"
        className="fixed left-0 top-0 z-50 h-[3px] w-full origin-left bg-[#f5900b]"
        style={{ scaleX: progressScale }}
      />

      <header className="absolute inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6 lg:px-8">
        <nav className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-4 rounded-[16px] border border-white/12 bg-white/94 px-3 shadow-[0_8px_26px_rgba(11,11,35,0.08)] backdrop-blur-md">
          <a href="#main-content" aria-label="Kresco accueil" className="flex h-10 items-center rounded-[12px] px-2 no-underline">
            <KrescoWordmark />
          </a>
          <div className="hidden items-center gap-1 md:flex">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-[11px] px-3 py-2 text-[13px] font-bold text-[#52525c] no-underline transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#f1f2f7] hover:text-[#18181b] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onLogin}
              className="hidden h-10 items-center justify-center rounded-[12px] border-0 bg-transparent px-3 text-[13px] font-black text-[#52525c] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#f1f2f7] hover:text-[#18181b] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 sm:inline-flex"
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={onSignup}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border-0 bg-[#453dee] px-4 text-[13px] font-black text-white transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#372dcc] hover:shadow-[0_8px_18px_rgba(69,61,238,0.22)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              Commencer <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </nav>
      </header>

      <section className="relative isolate min-h-[100svh] overflow-hidden bg-[#111033] text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(115deg,#111033_0%,#17164a_42%,#24205b_72%,#2f2554_100%)]" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.18] mix-blend-screen" style={noiseStyle} />
        <motion.div
          aria-hidden="true"
          className="absolute bottom-[-8rem] right-[-10rem] hidden h-[680px] w-[680px] rounded-full border border-white/10 lg:block"
          style={{ y: heroY, opacity: heroOpacity }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute right-[-7rem] top-[18svh] hidden w-[620px] max-w-[48vw] lg:block"
          initial={shouldReduceMotion ? false : { opacity: 0, x: 42, rotate: 1.5, filter: 'blur(10px)' }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0, rotate: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.74, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          style={{ y: heroY }}
        >
          <div className="relative min-h-[520px]">
            <div className="absolute left-16 top-4 h-[300px] w-[300px] overflow-hidden rounded-full border-[10px] border-white/10 bg-[#f5900b]">
              <Image
                src="/mascot/mascot.jpeg"
                alt=""
                fill
                priority
                sizes="300px"
                className="object-cover"
              />
            </div>
            <div className="absolute left-0 top-52 w-[430px] rotate-[-3deg] rounded-[18px] border border-white/14 bg-white/[0.08] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.24)] backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-[13px] font-black text-white">Plan du jour</p>
                  <p className="m-0 mt-1 text-[12px] font-bold text-white/62">Physique - Bac Maroc</p>
                </div>
                <span className="rounded-full bg-[#f5900b] px-3 py-1 text-[12px] font-black text-[#21122b]">72%</span>
              </div>
              {['Ondes mecaniques', 'Exercices corriges', 'Sujet type Bac'].map((item, index) => (
                <div key={item} className="flex items-center gap-3 border-t border-white/12 py-3 first:border-t-0">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white/12 text-[12px] font-black text-white">{index + 1}</span>
                  <span className="min-w-0 flex-1 text-[13px] font-bold text-white">{item}</span>
                  <CheckCircle2 size={17} className={index === 0 ? 'text-[#6ee7b7]' : 'text-white/36'} aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className="absolute right-0 top-24 w-[300px] rotate-[4deg] rounded-[18px] border border-white/14 bg-[#f8fafc] p-4 text-[#18181b] shadow-[0_22px_65px_rgba(0,0,0,0.25)]">
              <div className="mb-3 flex items-center gap-2">
                <MessageCircle size={17} className="text-[#453dee]" aria-hidden="true" />
                <p className="m-0 text-[13px] font-black">Question au prof</p>
              </div>
              <p className="m-0 text-[13px] font-bold leading-[1.45] text-[#52525c]">&quot;Je bloque sur la diffraction. Je revise quoi avant l&apos;exercice ?&quot;</p>
              <div className="mt-4 rounded-[12px] bg-[#edf1ff] px-3 py-2 text-[12px] font-black text-[#453dee]">Reponse guidee</div>
            </div>
          </div>
        </motion.div>

        <div className="relative z-10 flex min-h-[100svh] items-center px-5 pb-14 pt-28 sm:px-8 lg:px-12">
          <motion.div
            className="max-w-[720px]"
            initial={shouldReduceMotion ? false : 'hidden'}
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
            }}
          >
            <motion.p variants={heroReveal} className="m-0 mb-5 inline-flex rounded-full border border-white/14 bg-white/8 px-3 py-2 text-[13px] font-black text-[#ffe5b4]">
              Preparation Bac - Maroc - revision guidee
            </motion.p>
            <motion.h1 variants={heroReveal} className="m-0 text-balance text-[64px] font-black leading-[0.9] tracking-normal sm:text-[80px] lg:text-[96px]">
              Kresco
            </motion.h1>
            <motion.h2 variants={heroReveal} className="m-0 mt-5 max-w-[650px] text-balance text-[34px] font-black leading-[1.05] tracking-normal sm:text-[44px] lg:text-[56px]">
              Reviser moins au hasard. Avancer plus surement.
            </motion.h2>
            <motion.p variants={heroReveal} className="m-0 mt-6 max-w-[600px] text-pretty text-[17px] font-semibold leading-[1.7] text-[#dfe2ff] sm:text-[18px]">
              Kresco transforme tes cours, exercices, examens blancs, lives et questions prof en un parcours clair pour preparer le Bac avec methode.
            </motion.p>
            <motion.div variants={heroReveal} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onSignup}
                className="inline-flex h-[52px] min-h-[52px] items-center justify-center gap-2 rounded-[14px] border-0 bg-white px-5 text-[15px] font-black text-[#18181b] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#f5f6ff] hover:shadow-[0_14px_30px_rgba(255,255,255,0.18)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                Creer mon espace <ArrowRight size={17} aria-hidden="true" />
              </button>
              <a
                href="#methode"
                className="inline-flex h-[52px] min-h-[52px] items-center justify-center rounded-[14px] border border-white/18 px-5 text-[15px] font-black text-white no-underline transition-[background-color,border-color,transform] duration-150 ease-out hover:border-white/32 hover:bg-white/8 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                Voir la methode
              </a>
            </motion.div>
            <motion.div variants={heroReveal} className="mt-9 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-bold text-white/70">
              {proofPoints.map((point) => (
                <span key={point} className="inline-flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-[#6ee7b7]" aria-hidden="true" />
                  {point}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>

        <a
          href="#methode"
          aria-label="Descendre vers la methode"
          className="absolute bottom-5 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/14 px-3 py-2 text-[12px] font-black text-white/70 no-underline transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/8 hover:text-white active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 sm:inline-flex"
        >
          Defiler <ChevronDown size={15} aria-hidden="true" />
        </a>
      </section>

      <section id="methode" className="relative bg-[#f7f8fb] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={reveal}
            className="lg:sticky lg:top-24 lg:self-start"
          >
            <p className="m-0 text-[15px] font-black text-[#453dee]">La force de Kresco</p>
            <h2 className="m-0 mt-4 max-w-[520px] text-balance text-[34px] font-black leading-[1.08] tracking-normal text-[#18181b] sm:text-[44px]">
              Une revision qui commence par la prochaine bonne action.
            </h2>
            <p className="m-0 mt-5 max-w-[560px] text-pretty text-[16px] font-semibold leading-[1.75] text-[#52525c]">
              L&apos;etudiant n&apos;a pas besoin d&apos;un autre dossier plein de videos. Il a besoin d&apos;un chemin, de pratique, puis d&apos;aide au bon moment.
            </p>
          </motion.div>

          <div className="grid gap-4">
            {methodSteps.map((step, index) => (
              <motion.article
                key={step.title}
                initial={shouldReduceMotion ? false : 'hidden'}
                whileInView="show"
                viewport={{ once: true, margin: '-60px' }}
                variants={reveal}
                transition={{ delay: shouldReduceMotion ? 0 : index * 0.05 }}
                className="group grid gap-5 border-t border-[#dfe2ea] py-7 first:border-t-0 sm:grid-cols-[76px_1fr]"
              >
                <span className="text-[38px] font-black leading-none tabular-nums text-[#d4d7e2] transition-[color,transform] duration-200 ease-out group-hover:text-[#f5900b] group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0">
                  {step.stat}
                </span>
                <div>
                  <h3 className="m-0 text-balance text-[24px] font-black leading-[1.12] text-[#18181b]">{step.title}</h3>
                  <p className="m-0 mt-3 text-pretty text-[15px] font-semibold leading-[1.7] text-[#52525c]">{step.body}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="outils" className="bg-white px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-[1180px]">
          <motion.div
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={reveal}
            className="flex flex-col justify-between gap-5 md:flex-row md:items-end"
          >
            <div>
              <p className="m-0 text-[15px] font-black text-[#453dee]">Tout dans le meme rythme</p>
              <h2 className="m-0 mt-4 max-w-[680px] text-balance text-[34px] font-black leading-[1.08] tracking-normal text-[#18181b] sm:text-[44px]">
                Les outils qu&apos;un eleve utilise vraiment pendant l&apos;annee.
              </h2>
            </div>
            <button
              type="button"
              onClick={onSignup}
              className="inline-flex h-12 items-center justify-center gap-2 self-start rounded-[14px] border-0 bg-[#453dee] px-5 text-[14px] font-black text-white transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#372dcc] hover:shadow-[0_10px_22px_rgba(69,61,238,0.22)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 md:self-end"
            >
              Tester Kresco <ArrowRight size={16} aria-hidden="true" />
            </button>
          </motion.div>

          <div className="mt-12 grid border-y border-[#e5e7ef] md:grid-cols-2">
            {strengths.map((item) => {
              const Icon = item.icon
              return (
                <motion.article
                  key={item.title}
                  initial={shouldReduceMotion ? false : 'hidden'}
                  whileInView="show"
                  viewport={{ once: true, margin: '-70px' }}
                  variants={reveal}
                  className="group grid min-h-[190px] grid-cols-[44px_1fr] gap-5 border-b border-[#e5e7ef] py-7 md:px-7 md:[&:nth-child(odd)]:border-r md:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#edf1ff] text-[#453dee] transition-[background-color,color,transform] duration-200 ease-out group-hover:bg-[#453dee] group-hover:text-white group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="m-0 text-[21px] font-black leading-tight text-[#18181b]">{item.title}</h3>
                    <p className="m-0 mt-3 max-w-[430px] text-pretty text-[15px] font-semibold leading-[1.65] text-[#52525c]">{item.body}</p>
                  </div>
                </motion.article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#18181b] px-5 py-20 text-white sm:px-8 lg:px-12 lg:py-28">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.1]" style={noiseStyle} />
        <div className="relative mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <motion.div
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={reveal}
          >
            <p className="m-0 text-[15px] font-black text-[#f5900b]">Experience etudiante</p>
            <h2 className="m-0 mt-4 max-w-[580px] text-balance text-[34px] font-black leading-[1.08] tracking-normal sm:text-[44px]">
              Ton espace garde la pression utile, pas le stress inutile.
            </h2>
            <p className="m-0 mt-5 max-w-[570px] text-pretty text-[16px] font-semibold leading-[1.75] text-white/72">
              Progression, calendrier, sessions live, banque d&apos;exercices et examens blancs sont relies par une seule question : qu&apos;est-ce que tu dois faire maintenant ?
            </p>
          </motion.div>

          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 28, clipPath: 'inset(12% 0 0 0 round 18px)' }}
            whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0% 0 0 0 round 18px)' }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.62, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-[18px] bg-[#f7f8fb] p-3 text-[#18181b]"
          >
            <div className="grid gap-3 rounded-[14px] bg-white p-4">
              <div className="flex items-center justify-between gap-4 border-b border-[#e5e7ef] pb-4">
                <div>
                  <p className="m-0 text-[13px] font-black text-[#453dee]">Aujourd&apos;hui</p>
                  <p className="m-0 mt-1 text-[20px] font-black">3 actions pour avancer</p>
                </div>
                <span className="rounded-full bg-[#ecfdf5] px-3 py-1 text-[12px] font-black text-[#047857]">Rythme OK</span>
              </div>
              {[
                ['Video', 'Lois de Newton', '12 min'],
                ['Exercice', 'Application directe', '8 questions'],
                ['Exam blanc', 'Probleme 2', '35 min'],
              ].map(([kind, title, meta]) => (
                <div key={title} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 rounded-[12px] bg-[#f7f8fb] px-3 py-3">
                  <span className="text-[12px] font-black text-[#71717b]">{kind}</span>
                  <span className="min-w-0 truncate text-[14px] font-black text-[#18181b]">{title}</span>
                  <span className="text-[12px] font-black text-[#453dee]">{meta}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section id="offre" className="bg-[#f7f8fb] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <motion.div
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={reveal}
          >
            <p className="m-0 text-[15px] font-black text-[#453dee]">Commencer simplement</p>
            <h2 className="m-0 mt-4 max-w-[680px] text-balance text-[34px] font-black leading-[1.08] tracking-normal text-[#18181b] sm:text-[44px]">
              Cree ton espace, choisis ton niveau, puis laisse Kresco organiser la suite.
            </h2>
          </motion.div>
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[18px] border border-[#dfe2ea] bg-white p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-[14px] font-black text-[#52525c]">Espace etudiant</p>
                <p className="m-0 mt-2 text-[32px] font-black leading-none text-[#18181b]">Demarrage gratuit</p>
              </div>
              <BookOpenCheck size={28} className="text-[#f5900b]" aria-hidden="true" />
            </div>
            <div className="mt-6 grid gap-3">
              {['Acces au parcours', 'Creation de compte', 'Niveau et filiere personnalises', 'Offres avancees visibles ensuite'].map((item) => (
                <div key={item} className="flex items-center gap-3 text-[14px] font-bold text-[#52525c]">
                  <CheckCircle2 size={17} className="text-[#16a34a]" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onSignup}
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-[#453dee] px-5 text-[14px] font-black text-white transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#372dcc] hover:shadow-[0_10px_22px_rgba(69,61,238,0.22)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              Commencer maintenant <ArrowRight size={16} aria-hidden="true" />
            </button>
          </motion.div>
        </div>
      </section>

      <section id="faq" className="bg-white px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto grid max-w-[980px] gap-10">
          <motion.div
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={reveal}
          >
            <p className="m-0 text-[15px] font-black text-[#453dee]">Questions frequentes</p>
            <h2 className="m-0 mt-4 text-balance text-[34px] font-black leading-[1.08] tracking-normal text-[#18181b] sm:text-[44px]">
              Clair avant meme de creer ton compte.
            </h2>
          </motion.div>

          <div className="border-y border-[#e5e7ef]">
            {faqItems.map((item) => (
              <details key={item.question} className="group border-b border-[#e5e7ef] py-5 last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[18px] font-black text-[#18181b] marker:hidden">
                  {item.question}
                  <ChevronDown size={20} className="shrink-0 text-[#71717b] transition-[transform,color] duration-150 ease-out group-open:rotate-180 group-open:text-[#453dee] motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <p className="m-0 max-w-[760px] pt-3 text-pretty text-[15px] font-semibold leading-[1.75] text-[#52525c]">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#111033] px-5 py-[72px] text-white sm:px-8 lg:px-12 lg:py-24">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.16]" style={noiseStyle} />
        <div className="relative mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="m-0 text-[15px] font-black text-[#f5900b]">Pret pour la prochaine seance ?</p>
            <h2 className="m-0 mt-3 max-w-[720px] text-balance text-[34px] font-black leading-[1.08] tracking-normal sm:text-[44px]">
              Lance ton espace Kresco et commence par une vraie action.
            </h2>
          </div>
          <button
            type="button"
            onClick={onSignup}
            className="inline-flex h-[52px] min-h-[52px] items-center justify-center gap-2 rounded-[14px] border-0 bg-white px-5 text-[15px] font-black text-[#18181b] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#f5f6ff] hover:shadow-[0_14px_30px_rgba(255,255,255,0.18)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Creer mon compte <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </section>
    </main>
  )
}
