---
layout: post
title: 关于磁盘IO的那些事
categories: [技术]
description: some word here
keywords: IO, Java, 磁盘, 文件系统


---

## 一、Disk I/O subsystem概览

![](https://www.thomas-krenn.com/de/wikiDE/images/e/e0/Linux-storage-stack-diagram_v4.10.png)

![](/images/2022-03-03-16-14-26-image.png)

![](https://i.stack.imgur.com/kiP8n.png)

## 二、Linux I/O 自顶向下过程

![](https://sean10.github.io/2021/09/08/IO%E8%B7%AF%E5%BE%84%E6%B5%81%E5%90%91%E5%88%9D%E6%8E%A2/IO%E8%B7%AF%E5%BE%84%E6%B5%81%E5%90%91%E5%B0%8F%E8%AE%B0_2020-12-05-01-11-50.png)

## 三、I/O  subsystem architecture

![](https://liaoph.com/img/in-post/linux-system-io/io-arch.png)

上图概括了一次磁盘 write 操作的过程，假设文件已经被从磁盘中读入了 page cache 中

1. 一个用户进程通过 write() 系统调用发起写请求

2. 内核更新对应的 page cache

3. pdflush 内核线程将 page cache 写入至磁盘中

4. 文件系统层将每一个 block buffer 存放为一个 bio 结构体，并向块设备层提交一个写请求

5. 块设备层从上层接受到请求，执行 IO 调度操作，并将请求放入IO 请求队列中

6. 设备驱动（如 SCSI 或其他设备驱动）完成写操作

7. 磁盘设备固件执行对应的硬件操作，如磁盘的旋转，寻道等，数据被写入到磁盘扇区中

### VFS/File System Layer

#### 虚拟文件系统

VFS（Virtual File System）：屏蔽下层具体文件系统操作的差异，为上层操作提供一个统一的接口。

- 超级块（Super Block）

- 索引节点（Inode）

- 目录项（Dentry）

- 文件对象（File）

![](https://liaoph.com/img/in-post/linux-system-io/vfs.png)

#### Page Cache Layer

在Linux的实现中，文件Cache分为两个层面，一是Page Cache，另一个Buffer Cache，每一个Page Cache包含若干Buffer Cache

![](https://imgconvert.csdnimg.cn/aHR0cHM6Ly9sZGF5LW1lLTEyNTc5MDYwNTguY29zLmFwLXNoYW5naGFpLm15cWNsb3VkLmNvbS8wMDIzX2xpbnV4X3BhZ2VfY2FjaGVfYW5kX2J1ZmZlcl9jYWNoZS9pbWcvMjhfbGludXgtMi42LjE4X3BhZ2VfY2FjaGVfYnVmZmVyX2NhY2hlLnBuZw?x-oss-process=image/format,png)

### Block Layer

Block layer 处理所有和块设备相关的操作。block layer 最关键是数据结构是 bio 结构体。bio 结构体是 file system layer 到 block layer 的接口。 当执行一个写操作时，文件系统层将数据写入 page cache（由 block buffer 组成），将连续的块放到一起，组成 bio 结构体，然后将 bio 送至 block layer。

![](https://image.ldbmcs.com/2021-03-22-rA5r5y.jpg)

block layer 处理 bio 请求，并将这些请求链接成一个队列，称作 IO 请求队列，这个连接的操作就称作 IO 调度（也叫 IO elevator 即电梯算法）.

#### IO sheduler

IO 调度器的总体目标是减少磁盘的寻道时间（因此调度器都是针对机械硬盘进行优化的），IO 调度器通过两种方式来减少磁盘寻道：**合并**和**排序**。

调度器的算法和电梯运行的策略相似，因此 IO 调度器也被称作 IO 电梯( IO Elevator )。由于对请求进行了重排，一部分的请求可能会被延迟，以提升整体的性能。

- Linus Elevator

- Deadline - latency-oriented

- Anticipatory(AS)

- Complete Fair Queuing(CFQ) - faireness-oriented

- NOOP(No Operationo)

### Disk device

机械磁盘性能影响因素

- `Tseek`寻道时间（一般在3~15ms）

- `Trotation`旋转延迟

- `Transfer`数据传输时间

## 四、Java IO

![](https://www.0xffffff.org/images/41/linux-io.png)

### Buffer IO

适用于普通类型的文件读写，性能尚可，操作简单，无注意事项。

### MMAP

![](https://www.linuxjournal.com/files/linuxjournal.com/linuxjournal/articles/063/6345/6345f2.jpg)

- 优点
  
  - 小数据量的读写性能极高

- 缺点
  
  - 映射的大小最好4k对齐
  
  - 释放麻烦
  
  - 只能定长
  
  - 随机写频繁的场景下，性能不一定比Buffer IO快

### Direct IO

需要自己控制Cache时，可以适用Direct IO，例如数据库/中间件应用，可以避免文件的读写还经过一层Page Cache，造成额外开销。

- 在 open 時下的參數，允許用戶直接繞過 Linux kernel’s caches (Page Cache) 直接從用戶空間傳遞接收 data 到 disk。

- 可以减少复制

- 可能会降低性能，kernel对于缓存做的优化会失效，例如read_ahead

## 五、 Zero Copy

传统文件传输的缺陷

- 四次拷贝

- 用户态和内核态切换

![Traditional data copying approach](https://s3.us.cloud-object-storage.appdomain.cloud/developer/default/articles/j-zerocopy/images/figure1.gif)

- DMA：直接内存访问（*Direct Memory Access*）技术
  
  - 在进行 I/O 设备和内存的数据传输的时候，数据搬运的工作全部交给 DMA 控制器，而 CPU 不再参与任何与数据搬运相关的事情，这样 CPU 就可以去处理别的事务

- NIC Buffer： Network Interface Controller Buffer

![Traditional context switches](https://s3.us.cloud-object-storage.appdomain.cloud/developer/default/articles/j-zerocopy/images/figure2.gif)

### First optmization

![152342tio7forhklj3luub.png?Zero%20copy3.](https://forum.huawei.com/enterprise/en/data/attachment/forum/201905/24/152342tio7forhklj3luub.png?Zero%20copy3.png)

- TransferTo：Java支持zero copy的函数，底层是sendfile

![152348gsitiirtrsfycvrh.png?Zero%20copy4.](https://forum.huawei.com/enterprise/en/data/attachment/forum/201905/24/152348gsitiirtrsfycvrh.png?Zero%20copy4.png)

### Second optimization

![152400j83v30drr3oc77d5.png?Zero%20copy5.](https://forum.huawei.com/enterprise/en/data/attachment/forum/201905/24/152400j83v30drr3oc77d5.png?Zero%20copy5.png)

- Descriptor：文件描述符
1. the DMA engine copies the contents of the file to the read buffer;

2. **Only the information descriptor of the position and length of the data is appended to the socket buffer**. DMA directly copies the data from the read buffer to the NIC buffer; thus omitting the CPU copy;

#### mmap

mmap 是 Linux 提供的一种内存映射文件的机制，它实现了将内核中读缓冲区地址与用户空间缓冲区地址进行映射，从而实现内核缓冲区与用户缓冲区的共享。
这样就减少了一次用户态和内核态的 CPU 拷贝，但是在内核空间内仍然有一次 CPU 拷贝。

mmap 对大文件传输有一定优势，但是小文件可能出现碎片，并且在多个进程同时操作文件时可能产生引发 coredump 的 signal。

## 六、基于磁盘I/O的设计与调优

### 基于磁盘I/O的设计优化

#### 采用追加写

- 数据是被整体访问，比如HDFS

- 知道文件明确的偏移量，比如kafka

- 日志结构合并树LSM，比如HBase，LevelDB

#### 文件合并和元数据优化

目前的大多数文件系统，如XFS/Ext4、GFS、HDFS，在元数据管理、缓存管理等实现策略上都侧重大文件

- 小文件合并

- 元数据管理优化

### 基于磁盘I/O的参数调优

- IO调度队列长度
  
  - /sys/block//queue/nr_requests
  
  - 默认128，一般不建议修改

- read-ahead预读

> 预读量的默认值为512扇区，即256KB。用户可以使用cat命令查询当前块设备预读量。

> linux-ob3a:~ # cat /sys/block/sdc/queue/read_ahead_kb 512

## 七、IO的指标与监控

- IOPS

每秒的输入输出量(或读写次数)，也就是在一秒内，磁盘进行多少次 I/O 读写。是衡量磁盘性能的主要指标之一。

- 吞吐量

指单位时间内可以成功传输的数据数量。即磁盘写入加上读出的数据的大小。吞吐量等于IOPS乘以每次IO大小。

- 使用率

使用率，是指磁盘处理I/O的时间百分比，也就是一个时间段内磁盘用于处理IO的时间占这段时间的比例。过高的使用率(比如超过80% ) , 通常意味着磁盘I/O存在性能瓶颈。

- 饱和度

饱和度，是指磁盘处理I/O的繁忙程度，也就是能否接受新的IO请求。过高的饱和度,意味着磁盘存在严重的性能瓶颈。当饱和度为100%时,磁盘无法接受新的I/O请求。

- 响应时间

响应时间,是指I/O请求从发出到收到响应的间隔时间。

### 性能监测工具提供的指标

| 性能工具            | 性能指标                                    |
| --------------- | --------------------------------------- |
| iostat          | 磁盘I/O使用率、IOPS、 吞吐量、响应时间、I/O平均大小以及等待队列长度 |
| pidstat         | 进程I/O大小以及I/O延迟                          |
| sar             | 磁盘I/O使用率、IOPS 、吞吐量以及响应时间                |
| dstat           | 磁盘I/O使用率、IOPS以及吞吐量                      |
| iotop           | 按I/O大小对进程排序                             |
| slabtop         | 目录项、索引节点以及文件系统的缓存                       |
| /proc/slabinfo  | 目录项、索引节点以及文件系统的缓存                       |
| /proc/meminfo   | 页缓存和可回收Slab缓存                           |
| /proc/diskstats | 磁盘的IOPS、吞吐量以及延迟!                        |
| /proc/pid/io    | 进程IOPS、IO大小以及IO延迟                       |
| vmstat          | 缓存和缓冲区用量汇总                              |
| blktrace        | 跟踪块设备I/O事件                              |
| biosnoop        | 跟踪进程的块设备I/O大小                           |
| biotop          | 跟踪进程块I/O并按I/O大小排序                       |
| strace          | 跟踪进程的I/O系统调用                            |
| perf            | 跟踪内核中的I/O事件                             |
| df              | 磁盘空间和索引节点使用量和剩余量                        |
| mount           | 文件系统的挂载路径以及挂载参数                         |
| du              | 目录占用的磁盘空间大小                             |
| tune2fs         | 显示和设置文件系统参数                             |
| hdparam         | 显示和设置磁盘参数                               |

## 八、FAQ

- 描述下数据写入磁盘的过程，

- 说说zero copy技术，以及应用场景

## 参考文档

[# Linux Perf](Linux perf Examples](https://www.brendangregg.com/perf.html))

[# IO路径流向初探 行路中. 脚踏实地](https://sean10.github.io/2021/09/08/IO%E8%B7%AF%E5%BE%84%E6%B5%81%E5%90%91%E5%88%9D%E6%8E%A2/)

[# I/O设备吞吐量与延迟简介](http://kerneltravel.net/blog/2020/io_sys_szp_no2/)

[# Embedded System: Glimpses of Device drivers](http://embeddedsystemforu.blogspot.com/2013/08/glimpses-of-device-drivers.html)

[# Linux内核Page Cache和Buffer Cache关系及演化历史_jinking01的专栏-CSDN博客](https://blog.csdn.net/jinking01/article/details/107480248)

[# Linux 性能优化之 IO 子系统 - Fantasy](https://liaoph.com/linux-system-io/)[Linux 性能优化之 IO 子系统 - Fantasy](https://liaoph.com/linux-system-io/)

[# 内存映射文件 mmap 原理深度剖析_禅与计算机程序设计艺术-程序员信息网 - 程序员信息网](https://www.i4k.xyz/article/universsky2015/100528640)

[# linux network stack](http://hushi55.github.io/2015/10/22/linux-network-stack)
