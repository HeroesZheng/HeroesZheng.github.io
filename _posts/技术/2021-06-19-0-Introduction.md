---
layout: post
title: Distributed Systems概览
categories: [分布式]
date: 2021-06-25
description: some word here
keywords: 数据库, 日志, 事务, crash safe,InnnoDB
---

#### 1、Introduction

1. 再谈CAP
2. ACID与CAP
3. 2PC&3PC
4. 当我们聊起一致性，我们在聊什么

#### 2、Replication

1. 说说Log
2. WAL+Checkpoint
3. Replication State Machine
4. 复制算法
5. Quorums
6. 关于复制Raft和Paxos有什么区别

#### 3、Leader Election

1. 故障检测：Failure Detector
2. Leader Election如何找到候选Leader
3. 脑裂与Fencing
4. 分布式系统的租约（lease）机制
   - 租约在分布式系统中有着广泛的引用，比如选举、分布式锁、缓存一致性等。其本质是一种协调机制，是的分布式环境中，让不同进程之间产生的一种同步寓意。

#### Consensus

1. Consensus的挑战
2. Two generals problem
3. Byzantine generals problem
4. FLT定理
5. 分布式系统的通讯模型
   - 同步模型
   - 异步模型
     - FLT定理
6. 分布式系统的故障模型
   - byzantine or arbitary failure
   - Authentification detectable byzantine failure
   - performance failure
   - omission failure
   - Fail-stop failures
7. 分布式共识算法
8. Multi-paxos VS Raft
9. Raft顺序投票的性能缺陷
   1. 思考：Mysql的binlog复制基于Raft的日志复制有什么问题？

#### 分布式事务与Consensus

1. Two-phase commit
2. Linearizablility
3. 分布式事务的解决方案

#### 实践篇

1. Redis上云存在哪些挑战
2. 跨地域的金融容灾架构的演进

其他
