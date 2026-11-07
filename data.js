// Portfolyo içeriği — yeni iş eklemek için sadece bu dosyayı düzenleyin.
// youtube: y("VIDEO_ID", ...) ile eklenir; kapak YouTube'dan otomatik gelir.
// Elle eklemek için: youtube[].thumb: Canva'dan dışa aktarılan kapak görselinin yolu (örn. "assets/yt/4bir4bir-1.jpg")
// youtube[].url:   videonun YouTube linki (varsa kartın üzerine tıklayınca açılır)
const r = (...ids) => ids.map((id) => ({ id }));
const y = (...ids) => ids.map((id) => ({ url: `https://youtu.be/${id}`, thumb: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` }));

window.PORTFOLIO = {
  name: "Sıla Dengiz",
  role: "Video Çekim & Kurgu",
  email: "dengizzsila35@gmail.com", // örn. "sila@ornek.com"
  instagram: "https://instagram.com/dengizzsila", // örn. "https://instagram.com/kullaniciadi"
  linkedin: "", // örn. "https://linkedin.com/in/kullaniciadi"
  phone: "", // örn. "+905551112233" (WhatsApp için ülke koduyla)
  brands: [
    {
      key: "4bir4bir",
      title: "4Bir4Bir",
      tag: "Çekim + Kurgu",
      note: "2026 sezonu · tüm menajer içerikleri",
      color: "#ff2d3d",
      youtube: y("dsoUOjMFDdk","2FXYdyMjDM4","iBdv4wCvqIQ","3gtzgTVfc2I","BTMvkitgPr0","ywTt32eO1WE","9xVsWwXIo-c"),
      reels: r(
        "DW6ZT5zilCw","DZ2e2nMKL9O","DXfCvyFil0r","DWpR0MOinKD","DVEP_5xCp-4","DUOCzY_ivwA","DbIaaYWK-qE",
        "DbGyY8eKw4s","DaIWXsdqG44","DYxFyDbqxhM","DZCOqCPK-y9","DX1iUgzqMZe","DXMxewICsZU","DW8Zy7AirVg",
        "DeZH0YPq7mk","DeWbN-SqynK","DeOdUk0qF5x","DeHuFDOqV33","DcOTWMFI3Dc","DeUooMoKPxs"
      ),
    },
    {
      key: "cev-tr",
      title: "CEV Türkiye",
      tag: "Çekim + Kurgu",
      color: "#d7ff3a",
      reels: r("DXHrisSso4p","DXU6xb6Oswq","DX9hR1MMU_Y","DX378saux73","DX2N-5zuLHY","DX3rBafsSBn","DXBpo17O8Rz","DW6YGbbsBMn","DYCQ-GgsDds","DXXHgcws1M4","DXG3R2UM4x_"),
    },
    {
      key: "cev-eu",
      title: "CEV European Volleyball",
      tag: "Çekim + Kurgu",
      color: "#3aa8ff",
      reels: r("DeeifzHIhyu","DeROe3UIpIm","DdEwzeZOiMw","Dc-dwvLqduy","Dc9IkVpuLC5","Dc9GvLTOO2a","Dc9Bi5Sug_X","Dc1XUIKOjp2","DcnfKRuIG2r","DcdC6mKIfDS","DcQ5c_toOkO","DcRb5UdIZ1t"),
    },
    {
      key: "diabolica",
      title: "Diabolica",
      tag: "Çekim + Kurgu",
      color: "#ff7a1a",
      youtube: y("OlyfQFlVIjk","nanEQVJKBfw","k3woAKSIraM","QrYpxTPzEx0","blLb2KxGjgU","M9c9kEnXOec"),
      reels: r("DP_o_s6jNHG","DXj1byXDcC5","DXPShYHDW_o","DV8g0M_jVZo","DPsv2n3igpJ"),
    },
    {
      key: "oyunu-degistir",
      title: "Oyunu Değiştir",
      tag: "Çekim + Kurgu",
      color: "#b45cff",
      youtube: y("zNhevNxbUAM","g9e8NwKJcT0","IA-AHVsarrs","gXGB8uNpIb4","9Oj_YpQ-p50","WL9a2wkc9nE"),
      reels: r("DXgkUQsAAo2","DUsh7XWghqv","DUs8upqAnvZ","DQhioqlAt-0"),
    },
    {
      key: "basket-house",
      title: "Basket House",
      tag: "Çekim + Kurgu",
      color: "#ffb800",
      reels: r("DWZHpyzjPPq","DaDHX-4sPSD","DZelrGQOc8H","DXSN9k6Dpps"),
    },
    {
      key: "skordan-bagimsiz",
      title: "Skordan Bağımsız",
      tag: "Kurgu + Yapay Zeka",
      color: "#2dffc4",
      reels: r("Da_aiY9qBac","Da-ljCBqDIl","DZviEsHKBQ3","DYITTyKKNZ-","DUiWrkCipDn"),
    },
  ],
};
