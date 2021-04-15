# moode-back
Backend part of an alternative moode audio UI.

# from my raspi1.local:
sudo mount //truenas/src /mnt/src -o user=lemon,uid=1000,mfsymlinks,async,soft
cd /mnt/src/moode-back/
npm run build
npm start
