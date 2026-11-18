// =====================================================================
// 사이트 설정
// 여기 값들은 브라우저에 그대로 공개되는 값이에요. (공개돼도 되는 키만 넣기)
// 절대 넣지 말 것: Supabase 데이터베이스 비밀번호, service_role / secret 키
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://meyggbsizbgzhjqipqwc.supabase.co",
  SUPABASE_KEY: "sb_publishable_cNnOZrhsvYfkE3Or1UYICw_VFhyHUzd",

  // 관리 페이지에서 "곡 목록 불러오기"에만 사용 (시청자 화면에서는 안 씀)
  YOUTUBE_API_KEY: "AIzaSyCHvvUpg72sZrh0FMROgdibOZWPs488x7k",

  // 관리 페이지에서 '구글 로그인 → 유튜브 재생목록 만들기'에 사용 (공개돼도 되는 값)
  GOOGLE_CLIENT_ID: "332182399136-efvf7i0u9ugo9umo78qmcbl46uv7k7dk.apps.googleusercontent.com",

  // 첫 화면 상단 제목
  SITE_TITLE: "Playlists",
};
