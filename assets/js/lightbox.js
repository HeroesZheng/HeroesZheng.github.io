(function(window) {
    window.imageGallery = {
        currentIndex: 0,
        images: [],

        // 初始化图片库
        init: function() {
            // 获取所有图片并为其添加点击事件
            document.querySelectorAll('.gallery-image').forEach((img, index) => {
                this.images.push(img.dataset.large);  // 保存大图路径
                img.addEventListener('click', (event) => {
                    event.stopPropagation();  // 防止事件冒泡，点击图片本身时不关闭模态框
                    this.openLightbox(index);
                });
            });

            // 添加模态框外部区域的点击事件，点击空白区域时关闭模态框
            document.getElementById('lightbox').addEventListener('click', (event) => {
                if (event.target === event.currentTarget) {
                    this.closeLightbox();  // 只有点击模态框外部区域时才关闭
                }
            });
        },

        // 打开大图
        openLightbox: function(index) {
            this.currentIndex = index;
            const lightbox = document.getElementById('lightbox');
            const lightboxImg = document.getElementById('lightbox-img');
            const lightboxCaption = document.getElementById('lightbox-caption');

            lightbox.style.display = 'flex';  // 显示模态框
            lightboxImg.src = this.images[this.currentIndex];  // 设置大图路径
            lightboxCaption.textContent = document.querySelectorAll('.gallery-image')[this.currentIndex].alt;  // 设置说明文字
        },

        // 关闭大图
        closeLightbox: function() {
            document.getElementById('lightbox').style.display = 'none';  // 隐藏模态框
        },

        // 切换图片
        changeImage: function(direction) {
            this.currentIndex = (this.currentIndex + direction + this.images.length) % this.images.length;  // 计算新索引
            const lightboxImg = document.getElementById('lightbox-img');
            const lightboxCaption = document.getElementById('lightbox-caption');

            lightboxImg.src = this.images[this.currentIndex];  // 更新大图路径
            lightboxCaption.textContent = document.querySelectorAll('.gallery-image')[this.currentIndex].alt;  // 更新说明文字
        }
    };

    // 初始化图片库
    window.imageGallery.init();
})(window);

