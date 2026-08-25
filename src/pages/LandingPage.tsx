import { AppLink } from '../routes/AppLink'
import '../auth.css'

type LandingPageProps = {
  onNavigate: (path: string) => void
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <main className="public-page landing-page">
      <header className="public-header">
        <AppLink className="public-brand" href="/" onNavigate={onNavigate}>PaperBridge</AppLink>
        <nav aria-label="랜딩 메뉴">
          <AppLink className="public-text-link" href="/login" onNavigate={onNavigate}>로그인</AppLink>
        </nav>
      </header>

      <section className="landing-intro" aria-labelledby="landing-title">
        <p className="public-kicker">논문 읽기 작업 공간</p>
        <h1 id="landing-title">복사·붙여넣기 없이, AI 비용도 한 곳에서</h1>
        <p className="landing-lede">
          PDF에서 텍스트를 선택하면 탭을 옮기지 않고 설명을 듣고 번역하거나 질문할 수 있습니다. PaperBridge는 원문, 하이라이트, 읽기 맥락을 한 화면에 모아 둡니다.
        </p>
        <div className="public-actions">
          <AppLink className="button" href="/login" onNavigate={onNavigate}>로그인하거나 계정 만들기</AppLink>
          <AppLink className="button button--secondary" href="/library" onNavigate={onNavigate}>계정 없이 먼저 둘러보기</AppLink>
        </div>
      </section>

      <section className="landing-evidence" aria-label="PaperBridge 기능">
        <article className="landing-panel">
          <p className="public-kicker">읽기 흐름</p>
          <h2>근거를 계속 눈앞에 둡니다.</h2>
          <ul className="landing-list">
            <li>문서를 올리고 읽는 일을 하나의 보관함에서 처리합니다.</li>
            <li>수동 하이라이트를 문서와 선택한 텍스트에 연결해 둡니다.</li>
            <li>리더에서 설명, 번역, 맥락 질문을 바로 준비합니다.</li>
          </ul>
        </article>
        <article className="landing-panel">
          <p className="public-kicker">AI 제공자 상태</p>
          <h2>웹과 데스크톱의 선택지가 다릅니다.</h2>
          <dl className="availability-list">
            <div><dt>웹</dt><dd>설정에서 개인 OpenRouter API 키를 연결해 사용합니다.</dd></div>
            <div><dt>데스크톱 앱</dt><dd>설치·인증된 로컬 구독 CLI도 확인할 수 있습니다.</dd></div>
            <div><dt>계정</dt><dd>읽기 작업 공간과 모델 인증 정보를 분리해 보관합니다.</dd></div>
          </dl>
        </article>
      </section>

      <footer className="public-footer">
        <span>PaperBridge는 읽기에 집중한 작업 공간입니다.</span>
        <AppLink href="/library" onNavigate={onNavigate}>문서 보관함 열기</AppLink>
      </footer>
    </main>
  )
}
