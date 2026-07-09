// [v2] TODO: The legacy app/model/provider PNG/WebP logos were removed by the icon-system
// overhaul (#12858). The imports below are a stop-gap to keep tests green - each mini-app
// now receives a CompoundIcon from @cherrystudio/ui/icons instead of a deleted image URL.
// A proper design should decouple mini-app icon resolution (e.g. a dedicated registry or
// a `resolveMiniAppIcon` helper) rather than hard-coding CompoundIcon references here.

import type { CompoundIcon } from '@cherrystudio/ui'
import { ModelIcons } from '@cherrystudio/ui/icons'
import {
  Abacus,
  AiStudio,
  Anthropic,
  Application,
  Baichuan,
  Baidu,
  BoltNew,
  Bytedance,
  Coze,
  Dangbei,
  Deepseek,
  Devv,
  Dify,
  Doubao,
  Duck,
  Felo,
  Flowith,
  Genspark,
  GithubCopilot,
  Google,
  Grok,
  Groq,
  Huggingface,
  Ima,
  Lambda,
  Lingxi,
  Longcat,
  Metaso,
  MinimaxAgent,
  MinTop3,
  Mistral,
  Monica,
  Moonshot,
  N8n,
  NamiAi,
  Notebooklm,
  Openai,
  Openclaw,
  Perplexity,
  Poe,
  Qwen,
  Sensetime,
  Silicon,
  Skywork,
  Step,
  ThinkAny,
  Tng,
  Twitter,
  Wenxin,
  Xiaoyi,
  Xinghuo,
  You,
  Yuanbao,
  ZAi,
  ZeroOne,
  Zhida,
  Zhipu
} from '@cherrystudio/ui/icons'

// Logo ids whose artwork reads as a complete tile design (rounded-square/circular plate)
// and renders edge-to-edge in the launchpad tile. Everything else — bare vector marks and
// wordmark-on-white plates — gets the logo scaled and centered instead. Hand-picked with
// design review.
const FULL_BLEED_LOGO_IDS = new Set([
  '3mintop',
  'mintop3',
  'anthropic',
  'claude',
  'bolt',
  'coze',
  'doubao',
  'genspark',
  'groq',
  'ima',
  'lambda',
  'minimax',
  'notebooklm'
])

export function isMiniAppLogoFullBleed(logoId: string | undefined): boolean {
  return !!logoId && FULL_BLEED_LOGO_IDS.has(logoId.toLowerCase())
}

// Bordered launchpad tiles letterbox the logo via preserveAspectRatio, so a flat
// scale makes long/tall marks (silicon, tng, n8n…) read far smaller than square
// ones. Square and near-square logos (aspect ratio ≤ 1.3, which includes dify/grok)
// all share the 84% base; only clearly elongated marks scale their long edge
// further toward a 92% cap, so every tile reads at a comparable visual weight.
// Values derived from measured glyph bounding boxes; logos not listed here fall
// back to the base.
const MINI_APP_LOGO_SCALE_BASE = 0.84
const MINI_APP_LOGO_SCALE: Record<string, number> = {
  silicon: 0.92,
  tng: 0.92,
  n8n: 0.92,
  metaso: 0.92,
  dify: 0.92,
  mistral: 0.87,
  flowith: 0.87,
  longcat: 0.87,
  deepseek: 0.86
}

export function getMiniAppLogoScale(logoId: string | undefined): number {
  if (!logoId) return MINI_APP_LOGO_SCALE_BASE
  return MINI_APP_LOGO_SCALE[logoId.toLowerCase()] ?? MINI_APP_LOGO_SCALE_BASE
}

export function getMiniAppsLogo(LogoId: string | undefined): CompoundIcon | undefined {
  if (!LogoId) {
    return
  }
  switch (LogoId.toLowerCase()) {
    case 'application':
      return Application
    case 'openclaw':
      return Openclaw
    case 'openai':
      return Openai
    case 'gemini':
    case 'google':
      return Google
    case 'silicon':
      return Silicon
    case 'deepseek':
      return Deepseek
    case 'zeroone':
      return ZeroOne
    case 'zhipu':
      return Zhipu
    case 'moonshot':
      return Moonshot
    case 'baichuan':
      return Baichuan
    case 'qwen':
    case 'dashscope':
      return Qwen
    case 'step':
    case 'stepfun':
      return Step
    case 'doubao':
      return Doubao
    case 'bytedance':
      return Bytedance
    case 'minimax':
      return MinimaxAgent
    case 'groq':
      return Groq
    case 'anthropic':
    case 'claude':
      return Anthropic
    case 'wenxin':
      return Wenxin
    case 'baidu':
      return Baidu
    case 'yuanbao':
      return Yuanbao
    case 'sensetime':
      return Sensetime
    case 'xinghuo':
      return Xinghuo
    case 'metaso':
      return Metaso
    case 'poe':
      return Poe
    case 'perplexity':
      return Perplexity
    case 'devv':
      return Devv
    case 'tng':
      return Tng
    case 'felo':
      return Felo
    case 'duck':
      return Duck
    case 'namiai':
      return NamiAi
    case 'thinkany':
      return ThinkAny
    case 'githubcopilot':
      return GithubCopilot
    case 'genspark':
      return Genspark
    case 'grok':
      return Grok
    case 'twitter':
      return Twitter
    case 'flowith':
      return Flowith
    case 'mintop3':
    case '3mintop':
      return MinTop3
    case 'aistudio':
      return AiStudio
    case 'xiaoyi':
      return Xiaoyi
    case 'notebooklm':
      return Notebooklm
    case 'coze':
      return Coze
    case 'dify':
      return Dify
    case 'lingxi':
      return Lingxi
    case 'mistral':
      return Mistral
    case 'abacus':
      return Abacus
    case 'lambda':
      return Lambda
    case 'monica':
      return Monica
    case 'zhida':
      return Zhida
    case 'zai':
      return ZAi
    case 'n8n':
      return N8n
    case 'you':
      return You
    case 'longcat':
      return Longcat
    case 'bolt':
      return BoltNew
    case 'huggingface':
      return Huggingface
    case 'ima':
      return Ima
    case 'dangbei':
      return Dangbei
    case 'hailuo':
      return ModelIcons.Hailuo
    case 'ling':
      return ModelIcons.Ling
    case 'skywork':
    case 'tiangong':
      return Skywork
    default:
      return undefined
  }
}
