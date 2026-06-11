# Combark's Music

SunoAPI 키를 사용해 브라우저에서 바로 음악을 생성하는 설치형 PWA입니다.

## 사용 방법

1. 이 폴더를 GitHub Pages, Netlify, Vercel 같은 HTTPS 호스팅에 올립니다.
2. 휴대폰 브라우저에서 배포 URL을 엽니다.
3. 우측 상단 `key` 버튼을 눌러 SunoAPI 키를 저장합니다.
4. 프롬프트를 입력하고 `생성 시작`을 누릅니다.

## API

- 생성: `POST https://api.sunoapi.org/api/v1/generate`
- 결과 확인: `GET https://api.sunoapi.org/api/v1/generate/record-info?taskId=...`

브라우저에서 직접 API 키를 사용하는 구조입니다. 혼자 쓰는 앱에는 간단하지만, 공개 앱으로 배포할 때는 서버리스 함수나 백엔드 프록시로 API 키를 숨기는 구성이 더 안전합니다.
