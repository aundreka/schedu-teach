import { ImageResponse } from 'next/og'

export const alt = 'SchEDU: smarter lesson planning for teachers'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff',
          backgroundImage: 'radial-gradient(circle at 100% 0%, #dcfce7 0%, #ffffff 48%)',
          padding: '80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '68px',
              height: '68px',
              borderRadius: '16px',
              backgroundColor: '#16a34a',
              color: '#ffffff',
              fontSize: '42px',
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ marginLeft: '20px', fontSize: '42px', fontWeight: 800, color: '#0f172a' }}>
            SchEDU
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: '70px',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.05,
              maxWidth: '960px',
            }}
          >
            Plan your whole term in minutes, not weekends.
          </div>
          <div style={{ marginTop: '26px', fontSize: '30px', color: '#475569' }}>
            Smarter lesson planning for teachers. Built for Philippine classrooms.
          </div>
        </div>

        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              fontSize: '24px',
              fontWeight: 600,
              color: '#15803d',
              backgroundColor: '#dcfce7',
              padding: '12px 24px',
              borderRadius: '999px',
            }}
          >
            Coming to Android · 2026-2027 school year
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
