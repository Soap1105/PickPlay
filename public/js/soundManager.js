/**
 * PickPlay 통합 사운드 관리자 (SoundManager)
 * - BGM(배경음) 및 SFX(효과음) 분리 제어
 * - localStorage 볼륨/음소거 설정 영구 저장
 * - 브라우저 Autoplay 언락 지원
 */
(function() {
    // 기본 볼륨 설정값
    const DEFAULT_BGM_VOL = 0.07; // 은은한 BGM (7%)
    const DEFAULT_SFX_VOL = 0.50; // 명확한 효과음 (50%)

    // 오디오 리소스 매핑
    const BGM_SOURCES = {
        bingo: '/BGM/BingoBgm.mp3'
    };

    const SFX_SOURCES = {
        call: '/call.mp3',
        event: '/event.wav'
    };

    class SoundManager {
        constructor() {
            // 로컬 스토리지에서 이전 설정 불러오기
            this.bgmVolume = this._loadFloat('pp_bgm_vol', DEFAULT_BGM_VOL);
            this.sfxVolume = this._loadFloat('pp_sfx_vol', DEFAULT_SFX_VOL);
            this.isMuted = localStorage.getItem('pp_sound_muted') === 'true';

            // 오디오 객체 풀
            this.currentBgm = null;
            this.currentBgmName = null;
            this.sfxPool = {};

            // 사전 로드
            this._initAudio();

            // 유저 첫 인터랙션 시 자동재생 언락
            this._initAutoplayUnlock();
        }

        _loadFloat(key, defaultVal) {
            const val = localStorage.getItem(key);
            if (val === null || isNaN(val)) return defaultVal;
            return Math.max(0, Math.min(1, parseFloat(val)));
        }

        _initAudio() {
            // SFX 객체 생성
            for (const [key, src] of Object.entries(SFX_SOURCES)) {
                try {
                    const audio = new Audio(src);
                    audio.preload = 'auto';
                    this.sfxPool[key] = audio;
                } catch(e) {
                    console.warn(`[SoundManager] SFX '${key}' 생성 실패:`, e);
                }
            }
        }

        _initAutoplayUnlock() {
            const unlock = () => {
                document.removeEventListener('click', unlock);
                document.removeEventListener('keydown', unlock);
                // 오디오 재생 언락 시도
                if (this.currentBgm && this.currentBgm.paused && !this.isMuted) {
                    this.currentBgm.play().catch(() => {});
                }
            };
            document.addEventListener('click', unlock, { once: true });
            document.addEventListener('keydown', unlock, { once: true });
        }

        // BGM 재생
        playBgm(name) {
            const src = BGM_SOURCES[name];
            if (!src) return;

            // 이미 동일한 BGM이 재생 중인 경우
            if (this.currentBgm && this.currentBgmName === name && !this.currentBgm.paused) {
                return;
            }

            this.stopBgm();

            try {
                this.currentBgm = new Audio(src);
                this.currentBgm.loop = true;
                this.currentBgm.volume = this.isMuted ? 0 : this.bgmVolume;
                this.currentBgmName = name;

                this.currentBgm.play()
                    .then(() => console.log(`[SoundManager] BGM '${name}' 재생 시작`))
                    .catch((err) => console.warn(`[SoundManager] BGM 재생 대기 (인터랙션 필요):`, err));
            } catch(e) {
                console.warn(`[SoundManager] BGM '${name}' 생성 실패:`, e);
            }
        }

        // BGM 정지
        stopBgm() {
            if (this.currentBgm) {
                this.currentBgm.pause();
                this.currentBgm.currentTime = 0;
                this.currentBgm = null;
                this.currentBgmName = null;
            }
        }

        // SFX 재생
        playSfx(name) {
            if (this.isMuted) return;
            const audio = this.sfxPool[name];
            if (audio) {
                audio.currentTime = 0;
                audio.volume = this.sfxVolume;
                audio.play().catch(() => {});
            }
        }

        // BGM 볼륨 설정 (0.0 ~ 1.0)
        setBgmVolume(val) {
            this.bgmVolume = Math.max(0, Math.min(1, val));
            localStorage.setItem('pp_bgm_vol', this.bgmVolume.toString());
            if (this.currentBgm) {
                this.currentBgm.volume = this.isMuted ? 0 : this.bgmVolume;
            }
            if (this.isMuted && this.bgmVolume > 0) {
                this.setMute(false);
            }
            this._updateUI();
        }

        // SFX 볼륨 설정 (0.0 ~ 1.0)
        setSfxVolume(val) {
            this.sfxVolume = Math.max(0, Math.min(1, val));
            localStorage.setItem('pp_sfx_vol', this.sfxVolume.toString());
            if (this.isMuted && this.sfxVolume > 0) {
                this.setMute(false);
            }
            this._updateUI();
        }

        // 음소거 설정
        setMute(muted) {
            this.isMuted = !!muted;
            localStorage.setItem('pp_sound_muted', this.isMuted.toString());

            if (this.currentBgm) {
                this.currentBgm.volume = this.isMuted ? 0 : this.bgmVolume;
                if (!this.isMuted && this.currentBgm.paused) {
                    this.currentBgm.play().catch(() => {});
                }
            }
            this._updateUI();
        }

        toggleMute() {
            this.setMute(!this.isMuted);
        }

        // UI 바인딩 및 실시간 동기화
        initUI() {
            const trigger = document.getElementById('sound-popover-trigger');
            const card = document.getElementById('sound-popover-card');
            const closeBtn = document.getElementById('sound-popover-close');
            const bgmSlider = document.getElementById('bgm-volume-slider');
            const sfxSlider = document.getElementById('sfx-volume-slider');
            const muteBtn = document.getElementById('btn-mute-all');

            if (!trigger || !card) return;

            // 팝오버 토글
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                card.classList.toggle('show');
                trigger.classList.toggle('active');
            });

            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    card.classList.remove('show');
                    trigger.classList.remove('active');
                });
            }

            // 외부 클릭 시 닫기
            document.addEventListener('click', (e) => {
                if (!card.contains(e.target) && !trigger.contains(e.target)) {
                    card.classList.remove('show');
                    trigger.classList.remove('active');
                }
            });

            // 슬라이더 바인딩
            if (bgmSlider) {
                bgmSlider.addEventListener('input', (e) => {
                    const pct = parseInt(e.target.value) / 100;
                    this.setBgmVolume(pct);
                });
            }

            if (sfxSlider) {
                sfxSlider.addEventListener('input', (e) => {
                    const pct = parseInt(e.target.value) / 100;
                    this.setSfxVolume(pct);
                });
            }

            if (muteBtn) {
                muteBtn.addEventListener('click', () => {
                    this.toggleMute();
                });
            }

            this._updateUI();
        }

        _updateUI() {
            const bgmSlider = document.getElementById('bgm-volume-slider');
            const bgmLabel = document.getElementById('bgm-volume-label');
            const sfxSlider = document.getElementById('sfx-volume-slider');
            const sfxLabel = document.getElementById('sfx-volume-label');
            const muteBtn = document.getElementById('btn-mute-all');
            const muteLabel = document.getElementById('mute-all-label');
            const statusIcon = document.getElementById('sound-status-icon');

            const bgmPct = Math.round(this.bgmVolume * 100);
            const sfxPct = Math.round(this.sfxVolume * 100);

            if (bgmSlider) bgmSlider.value = this.isMuted ? 0 : bgmPct;
            if (bgmLabel) bgmLabel.textContent = (this.isMuted ? 0 : bgmPct) + '%';
            if (sfxSlider) sfxSlider.value = this.isMuted ? 0 : sfxPct;
            if (sfxLabel) sfxLabel.textContent = (this.isMuted ? 0 : sfxPct) + '%';

            if (muteBtn) {
                if (this.isMuted) {
                    muteBtn.classList.add('is-muted');
                    if (muteLabel) muteLabel.textContent = '음소거 해제';
                } else {
                    muteBtn.classList.remove('is-muted');
                    if (muteLabel) muteLabel.textContent = '전체 음소거';
                }
            }

            if (statusIcon) {
                statusIcon.className = this.isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
            }
        }
    }

    // 전역 싱글톤 인스턴스 등록
    window.soundManager = new SoundManager();

    // DOM 로드 완료 시 UI 자동 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.soundManager.initUI());
    } else {
        window.soundManager.initUI();
    }
})();
