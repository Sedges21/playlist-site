# 플레이리스트 사이트

유튜브 뮤직 재생목록을 사진 같은 화면으로 재생하는 사이트.

| 파일 | 역할 |
|---|---|
| `index.html` | 시청자 화면: 플레이리스트 목록 + 재생 화면 |
| `admin.html` | 관리 페이지: 로그인 후 플레이리스트 추가 / 수정 / 삭제 |
| `config.js` | Supabase 주소·공개 키, YouTube API 키 (모두 공개돼도 되는 값만) |
| `common.js` | 두 페이지가 같이 쓰는 코드 |
| `vendor/supabase.js` | Supabase 라이브러리 (supabase-js v2, MIT 라이선스) |

## 내 컴퓨터에서 실행
파일을 더블클릭해서 열면 유튜브 재생이 막혀요(오류 153). 반드시 로컬 서버로 열기:

```
cd 이_폴더
python3 -m http.server 8000
```

- 시청자 화면: http://localhost:8000/
- 관리 페이지: http://localhost:8000/admin.html

## 절대 넣지 말 것
- Supabase 데이터베이스 비밀번호
- Supabase service_role / secret 키

## 관리자 추가 (Supabase → SQL Editor)
1. Authentication → Users → Add user 로 계정 생성
2. 아래 실행 (이메일만 바꾸기)

```sql
insert into public.admins (user_id, note)
select id, '스트리머' from auth.users
where email = 'their@email.com'
on conflict (user_id) do nothing;
```
